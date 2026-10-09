/**
 * Contract smoke tests — the only suite that talks to a real Spring.
 *
 * Opt-in via `pnpm test:smoke` with the backend up — gateway on :8080, identity
 * on :9000; excluded from `pnpm test` so a stopped backend never reddens the
 * unit suite. Purpose is to catch the API drifting away from what the specs
 * record, which unit tests against MSW stubs cannot see.
 *
 * Signs up its own customers on every run and signs in through the real OAuth2
 * flow (`src/test/live-login.ts`), so it depends on no seeded account and works
 * against the dev profile and the compose stack alike. It needs
 * `BOOKLAND_OAUTH_CLIENT_SECRET` — the smoke config loads `.env.local`.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { IDENTITY_BASE_URL } from "@/lib/config";
import { refreshTokens, revokeRefreshToken } from "@/lib/auth/oauth";
import { freshCustomer, signInLive } from "@/test/live-login";
import { getBook, searchBooks } from "./books";
import { addCartItem, cartItemCount, getCart, removeCartItem, updateCartItem } from "./cart";
import { listCategories, listCategoryBooks } from "./categories";
import { apiFetch } from "./client";
import { ErrorCodes } from "./error-codes";
import { isApiError } from "./errors";
import { cancelOrder, checkout, getOrder, listOrders } from "./orders";
import { getOrderPayment } from "./payments";
import type {
  BookViewModel,
  OrderSummaryViewModel,
  OrderViewModel,
  PageResult,
} from "./types";

/** An id of the right shape that nothing is seeded with. */
const ABSENT_ID = "00000000-0000-0000-0000-000000000000";

/** Signs up a new customer and signs them in; returns the access token. */
async function signInAsNew(label: string): Promise<string> {
  const tokens = await signInLive(await freshCustomer(label));
  return tokens.access_token;
}

/**
 * Every date field in a response, flattened with its path.
 *
 * Used to assert the whole payload at once rather than field by field, so a
 * date the API grows later is covered without anyone remembering to add it.
 */
function dateFields(node: unknown, path = ""): Array<{ path: string; value: string }> {
  if (typeof node === "string") {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:/.test(node) ? [{ path, value: node }] : [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((item, index) => dateFields(item, `${path}[${index}]`));
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) =>
      dateFields(value, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

/** `Z` or an explicit offset — anything else does not identify an instant. */
const CARRIES_ZONE = /(Z|[+-]\d{2}:?\d{2})$/;

/** Asks `read` every half second until `done` holds, or fails after `timeoutMs`. */
async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`Still waiting: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** The order once the checkout saga has decided its fate. */
function settled(token: string, orderId: string): Promise<OrderViewModel> {
  return waitFor(
    () => getOrder(token, orderId),
    (order) => order.status !== "PENDING" && order.status !== "AWAITING_PAYMENT",
  );
}

describe("live API smoke", () => {
  it("GET /books with query params", async () => {
    const page = await apiFetch<PageResult<BookViewModel>>("/api/v1/books", {
      query: { size: 2, page: 0, sort: "title" },
    });
    expect(page.content.length).toBe(2);
    expect(page.content[0].coverImageUrl).toBeTruthy();
  });

  it("401 problem+json becomes a session problem", async () => {
    const error = await apiFetch("/api/v1/cart").catch((e: unknown) => e);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.TOKEN_MISSING);
    expect(isApiError(error) && error.isSessionProblem).toBe(true);
  });

  it("validation error arrives with per-field messages", async () => {
    const error = await apiFetch("/api/v1/auth/register", {
      method: "POST",
      body: { name: "", email: "nope", password: "a" },
      baseUrl: IDENTITY_BASE_URL,
    }).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(isApiError(error) && error.messagesFor("email")).toBeDefined();
    expect(isApiError(error) && error.isFieldScoped).toBe(true);
  });

  it("code flow + authenticated GET through the gateway", async () => {
    const tokens = await signInLive(await freshCustomer("flow"));
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.id_token).toBeTruthy();
    // 15 minutes, give or take the second the server rounds off.
    expect(tokens.expires_in).toBeGreaterThan(14 * 60);

    const cart = await apiFetch<{ customerId: string }>("/api/v1/cart", {
      accessToken: tokens.access_token,
    });
    expect(cart.customerId).toBeTruthy();
  });

  it("a refresh rotates the token, and the spent one is refused", async () => {
    const tokens = await signInLive(await freshCustomer("refresh"));

    const renewed = await refreshTokens(tokens.refresh_token);
    expect(renewed.refresh_token).not.toBe(tokens.refresh_token);
    // The reissued id_token is what logout names the session with.
    expect(renewed.id_token).toBeTruthy();

    const replay = await refreshTokens(tokens.refresh_token).catch((e: unknown) => e);
    expect(isApiError(replay) && replay.code).toBe(ErrorCodes.SESSION_ENDED);
  });

  it("a revoked refresh token is refused, which logout relies on", async () => {
    const tokens = await signInLive(await freshCustomer("revoke"));

    await revokeRefreshToken(tokens.refresh_token);

    const after = await refreshTokens(tokens.refresh_token).catch((e: unknown) => e);
    expect(isApiError(after) && after.code).toBe(ErrorCodes.SESSION_ENDED);
  });

  it("an invalid token ends the session rather than asking for a refresh", async () => {
    const error = await apiFetch("/api/v1/cart", {
      accessToken: "garbage.token.here",
    }).catch((e: unknown) => e);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.TOKEN_INVALID);
    expect(isApiError(error) && error.shouldAttemptRefresh).toBe(false);
  });
});

describe("live catalogue smoke", () => {
  it("searchBooks applies q and the price range", async () => {
    const byTerm = await searchBooks({ q: "duna" });
    expect(byTerm.totalElements).toBeGreaterThan(0);
    expect(byTerm.content.every((book) => /duna/i.test(book.title))).toBe(true);

    const expensive = await searchBooks({ minPrice: 50 });
    expect(expensive.content.every((book) => book.price >= 50)).toBe(true);
  });

  it("sorts by price ascending", async () => {
    const { content } = await searchBooks({ sort: "price", size: 5 });
    const prices = content.map((book) => book.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("ignores an unknown sort instead of rejecting it", async () => {
    // Why the parser discards a bad `sort` rather than reporting it: upstream
    // answers 200 in default order, so there is no error to surface.
    const page = await searchBooks({ sort: "bogus" as never });
    expect(page.content.length).toBeGreaterThan(0);
  });

  it("rejects a malformed category with a field-scoped 400", async () => {
    // The reason `parseBookSearchParams` drops a non-UUID category instead of
    // forwarding it: doing so would turn a hand-edited URL into an error page.
    const error = await searchBooks({ category: "not-a-uuid" }).catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(400);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.INVALID_PARAMETER);
    expect(isApiError(error) && error.messagesFor("category")).toBeDefined();
  });

  it("honours a size the storefront would consider too large", async () => {
    // No upstream cap, which is why MAX_PAGE_SIZE is enforced in the BFF.
    const page = await searchBooks({ size: 1000 });
    expect(page.size).toBe(1000);
  });

  it("answers an out-of-range page with an empty content array, not an error", async () => {
    const page = await searchBooks({ page: 99, size: 2 });
    expect(page.content).toEqual([]);
    expect(page.totalElements).toBeGreaterThan(0);
  });

  it("getBook returns the full detail shape, and 404s for an absent id", async () => {
    const [first] = (await searchBooks({ size: 1 })).content;
    const book = await getBook(first.id);
    expect(book).toMatchObject({
      id: first.id,
      title: expect.any(String),
      isbn: expect.any(String),
      price: expect.any(Number),
      available: expect.any(Boolean),
      categoryId: expect.any(String),
    });
    expect(Array.isArray(book.authors)).toBe(true);

    const error = await getBook(ABSENT_ID).catch((e: unknown) => e);
    expect(isApiError(error) && error.isNotFound).toBe(true);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.BOOK_NOT_FOUND);
  });

  it("listCategories returns a bare array carrying bookCount", async () => {
    const categories = await listCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      bookCount: expect.any(Number),
    });
  });

  it("listCategoryBooks paginates, and 404s for an unknown category", async () => {
    const withBooks = (await listCategories()).find((category) => category.bookCount > 0);
    const page = await listCategoryBooks(withBooks!.id, { page: 0, size: 1 });
    expect(page.size).toBe(1);
    expect(page.content[0].categoryId).toBe(withBooks!.id);

    const error = await listCategoryBooks(ABSENT_ID).catch((e: unknown) => e);
    expect(isApiError(error) && error.isNotFound).toBe(true);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.CATEGORY_NOT_FOUND);
  });
});

/**
 * These are the tests stage 5a was opened with: the three cart rules in
 * docs/specs/05-cart-checkout.md come from a Linear story, not from observation,
 * and the owner's standing rule is that the API wins. Everything asserted here
 * was confirmed by hand first (2026-07-29) and then locked down.
 *
 * They share one real cart — the admin's — so each test starts by emptying it.
 */
describe("live cart smoke", () => {
  let token: string;
  let book: BookViewModel;

  beforeAll(async () => {
    token = await signInAsNew("cart");
    // Needs stock to exercise the quantity rules; the seed has no sold-out book.
    const { content } = await searchBooks({ size: 20 });
    book = content.find((candidate) => candidate.stockQuantity > 2)!;
    expect(book).toBeDefined();
  });

  beforeEach(async () => {
    const current = await getCart(token);
    for (const item of current.items) {
      await removeCartItem(token, item.bookId);
    }
  });

  it("hands back an empty cart rather than 404ing when nothing was ever added", async () => {
    const cart = await getCart(token);
    expect(cart.items).toEqual([]);
    expect(cart.total).toBe(0);
    expect(cart.customerId).toBeTruthy();
  });

  it("adds to the existing quantity instead of replacing it", async () => {
    await addCartItem(token, book.id, 2);
    const cart = await addCartItem(token, book.id, 1);

    // The rule the UI depends on: the button sends "how many more", never the
    // new total. Pre-summing here would double the line.
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(3);
    expect(cartItemCount(cart)).toBe(3);
  });

  it("returns lines already carrying title, cover and availability", async () => {
    // This is what removed the BFF aggregation that stage 5a originally planned.
    const cart = await addCartItem(token, book.id, 1);
    expect(cart.items[0]).toMatchObject({
      bookId: book.id,
      title: book.title,
      quantity: 1,
      unitPrice: expect.any(Number),
      subtotal: expect.any(Number),
      available: true,
    });
  });

  it("does not default an omitted quantity — it rejects the body", async () => {
    // Why `addCartItem` always sends one: the OpenAPI calls `quantity` optional,
    // but upstream binds it to a primitive int (09-contract-notes.md item 26).
    const error = await apiFetch("/api/v1/cart/items", {
      method: "POST",
      accessToken: token,
      body: { bookId: book.id },
    }).catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(400);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.MALFORMED_REQUEST);
  });

  it("sets an exact quantity on PATCH, and removes the line at 0", async () => {
    await addCartItem(token, book.id, 2);

    const patched = await updateCartItem(token, book.id, 1);
    expect(patched.items[0].quantity).toBe(1);

    const emptied = await updateCartItem(token, book.id, 0);
    expect(emptied.items).toEqual([]);
    // Confirmed by a follow-up read, not just by the mutation's own response.
    expect((await getCart(token)).items).toEqual([]);
  });

  it("refuses to exceed stock with CART_ITEM_UNAVAILABLE, never INSUFFICIENT_STOCK", async () => {
    const tooMany = book.stockQuantity + 1;

    const onAdd = await addCartItem(token, book.id, tooMany).catch((e: unknown) => e);
    expect(isApiError(onAdd) && onAdd.status).toBe(409);
    expect(isApiError(onAdd) && onAdd.code).toBe(ErrorCodes.CART_ITEM_UNAVAILABLE);

    await addCartItem(token, book.id, 1);
    const onPatch = await updateCartItem(token, book.id, tooMany).catch((e: unknown) => e);
    expect(isApiError(onPatch) && onPatch.code).toBe(ErrorCodes.CART_ITEM_UNAVAILABLE);
  });

  it("counts the running total against stock, not each request in isolation", async () => {
    // Two requests, each under stock, whose sum is over it.
    await addCartItem(token, book.id, book.stockQuantity);
    const error = await addCartItem(token, book.id, 1).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.CART_ITEM_UNAVAILABLE);
  });

  it("404s a PATCH on a missing line, but takes a repeated DELETE quietly", async () => {
    const error = await updateCartItem(token, book.id, 1).catch((e: unknown) => e);
    expect(isApiError(error) && error.status).toBe(404);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.BOOK_NOT_IN_CART);

    // DELETE being idempotent is what lets the UI ignore a double-click.
    await addCartItem(token, book.id, 1);
    expect((await removeCartItem(token, book.id)).items).toEqual([]);
    expect((await removeCartItem(token, book.id)).items).toEqual([]);
  });

  it("404s a book that is not in the catalogue at all", async () => {
    const error = await addCartItem(token, ABSENT_ID, 1).catch((e: unknown) => e);
    expect(isApiError(error) && error.isNotFound).toBe(true);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.BOOK_NOT_FOUND);
  });
});

/**
 * Stage 5b. Same reasoning as the cart block above: docs/specs/05-cart-checkout.md
 * described the checkout from a Linear story and got three things wrong (item 27
 * of 09-contract-notes.md). What the API actually does is locked down here.
 *
 * Runs as the **customer**, and really buys — each test consumes stock and
 * leaves an order behind. Harmless: the dev database is in-memory.
 */
describe("live checkout smoke", () => {
  let token: string;
  let book: BookViewModel;

  beforeAll(async () => {
    token = await signInAsNew("checkout");
    const { content } = await searchBooks({ size: 20 });
    book = content.find((candidate) => candidate.stockQuantity > 2)!;
    expect(book).toBeDefined();
  });

  beforeEach(async () => {
    const current = await getCart(token);
    for (const item of current.items) {
      await removeCartItem(token, item.bookId);
    }
  });

  it("starts a saga: 202 with the order PENDING, then CONFIRMED and paid", async () => {
    await addCartItem(token, book.id, 2);

    const order = await checkout(token, "PIX");

    // Started, not finished (docs/specs/21).
    expect(order.status).toBe("PENDING");
    expect(order.items).toHaveLength(1);
    expect(order.totalAmount).toBeCloseTo(book.price * 2, 2);

    const done = await settled(token, order.id);
    expect(done.status).toBe("CONFIRMED");
    expect(done.statusReason).toBeNull();
    expect(done.statusHistory).toContainEqual(
      expect.objectContaining({ fromStatus: "AWAITING_PAYMENT", toStatus: "CONFIRMED" }),
    );
    // The saga moved it, not a person.
    expect(done.statusHistory.every((step) => step.changedBy === null)).toBe(true);

    // The payment carries the method the customer chose — the order does not.
    const payment = await getOrderPayment(token, order.id);
    expect(payment).toMatchObject({ orderId: order.id, method: "PIX", status: "APPROVED" });
  });

  it("empties the cart once the order is confirmed", async () => {
    await addCartItem(token, book.id, 1);
    const order = await checkout(token, "CREDIT_CARD");
    await settled(token, order.id);

    const cart = await getCart(token);
    expect(cart.items).toEqual([]);
    expect(cart.total).toBe(0);
  });

  it("answers 409 CART_EMPTY when there is nothing to buy", async () => {
    const error = await checkout(token, "PIX").catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(409);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.CART_EMPTY);
  });

  it("rejects a method outside the enum as a bare MALFORMED_REQUEST", async () => {
    // Naming no field — which is why the BFF validates the method itself.
    await addCartItem(token, book.id, 1);

    const error = await apiFetch("/api/v1/cart/checkout", {
      method: "POST",
      accessToken: token,
      body: { paymentMethod: "BITCOIN" },
    }).catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(400);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.MALFORMED_REQUEST);
  });

  it("rejects a missing method with a field-scoped VALIDATION_ERROR", async () => {
    await addCartItem(token, book.id, 1);

    const error = await apiFetch("/api/v1/cart/checkout", {
      method: "POST",
      accessToken: token,
      body: {},
    }).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(isApiError(error) && error.messagesFor("paymentMethod")).toBeDefined();
  });

  it("404s an order id that does not exist", async () => {
    const error = await getOrder(token, ABSENT_ID).catch((e: unknown) => e);

    expect(isApiError(error) && error.isNotFound).toBe(true);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.ORDER_NOT_FOUND);
  });

  it("dates every response with a real instant, not a bare local time", async () => {
    // The backend moved LocalDateTime to Instant on 2026-07-30. This is the net:
    // a module left behind would send "2026-07-30T13:01:34" and the front would
    // read it in whatever zone it happens to run in.
    await addCartItem(token, book.id, 1);
    const order = await settled(token, (await checkout(token, "PIX")).id);

    const payloads = [
      await getCart(token),
      order,
      await getOrderPayment(token, order.id),
      await apiFetch("/api/v1/orders?size=3", { accessToken: token }),
    ];

    const dates = payloads.flatMap((payload) => dateFields(payload));
    expect(dates.length).toBeGreaterThan(0);
    for (const { path, value } of dates) {
      expect(`${path}=${value}`).toMatch(CARRIES_ZONE);
    }
  });
});

/**
 * Stage 6 — the order history and cancellation.
 *
 * Runs as a fresh customer and really buys and cancels, like the block above.
 * Each test creates the orders it needs rather than sharing them: the
 * account's history grows through the file and nothing may assume a count.
 */
describe("live orders smoke", () => {
  let token: string;
  let book: BookViewModel;

  beforeAll(async () => {
    token = await signInAsNew("orders");
    const { content } = await searchBooks({ size: 20 });
    book = content.find((candidate) => candidate.stockQuantity > 5)!;
    expect(book).toBeDefined();
  });

  /** Buys one copy as whoever holds `as`, and returns the order once confirmed. */
  async function buyOne(as: string = token): Promise<OrderViewModel> {
    const current = await getCart(as);
    for (const item of current.items) {
      await removeCartItem(as, item.bookId);
    }
    await addCartItem(as, book.id, 1);
    const order = await settled(as, (await checkout(as, "PIX")).id);
    expect(order.status).toBe("CONFIRMED");
    return order;
  }

  /** An order belonging to another customer, for the isolation tests. */
  async function foreignOrder(): Promise<{ adminToken: string; order: OrderViewModel }> {
    const adminToken = await signInAsNew("stranger");
    return { adminToken, order: await buyOne(adminToken) };
  }

  it("lists newest first", async () => {
    // The backend fixed this on 2026-08-05 (932727f). Before, the query ran with
    // no ORDER BY and the customer's newest order landed on the *last* page.
    const older = await buyOne();
    const newer = await buyOne();

    const { content } = await listOrders(token, { size: 50 });
    const positionOf = (id: string) => content.findIndex((order) => order.id === id);

    expect(positionOf(newer.id)).toBeGreaterThanOrEqual(0);
    expect(positionOf(newer.id)).toBeLessThan(positionOf(older.id));
    expect(content[0].id).toBe(newer.id);
  });

  it("pages without losing or repeating an order", async () => {
    // What the `id` tiebreaker buys us. These orders are created milliseconds
    // apart and can share a `createdAt`; without a stable tiebreaker one would
    // vanish from both pages while another appeared in both.
    await buyOne();
    await buyOne();
    await buyOne();

    const whole = await listOrders(token, { size: 50 });
    const paged: string[] = [];
    for (let page = 0; page * 2 < whole.totalElements; page += 1) {
      const slice = await listOrders(token, { page, size: 2 });
      paged.push(...slice.content.map((order) => order.id));
    }

    expect(paged).toEqual(whole.content.map((order) => order.id));
    expect(new Set(paged).size).toBe(paged.length);
  });

  it("ignores a sort parameter instead of failing on it", async () => {
    // The route never read one. Asserted so that "sort stopped working" can
    // never be mistaken for a regression on our side.
    const [plain, sorted] = await Promise.all([
      listOrders(token, { size: 5 }),
      apiFetch<PageResult<OrderSummaryViewModel>>("/api/v1/orders?size=5&sort=createdAt,asc", {
        accessToken: token,
      }),
    ]);

    expect(sorted.content.map((order) => order.id)).toEqual(
      plain.content.map((order) => order.id),
    );
  });

  it("honours ?size literally, which is why the BFF caps it", async () => {
    const page = await listOrders(token, { size: 1000 });

    expect(page.size).toBe(1000);
  });

  it("answers a page past the end with an empty list, not a 404", async () => {
    const page = await listOrders(token, { page: 99, size: 10 });

    expect(page.content).toEqual([]);
  });

  it("cancels a confirmed order and refunds it, answering 200 with the order", async () => {
    const order = await buyOne();

    const cancelled = await cancelOrder(token, order.id);

    // Named DELETE, answers the whole updated order.
    expect(cancelled.id).toBe(order.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.statusHistory).toContainEqual(
      expect.objectContaining({ fromStatus: "CONFIRMED", toStatus: "CANCELLED" }),
    );

    // The refund is automatic — nothing asked for it — and asynchronous.
    const payment = await waitFor(
      () => getOrderPayment(token, order.id),
      (current) => current.status !== "REFUND_PENDING" && current.status !== "APPROVED",
    );
    expect(payment.status).toBe("REFUNDED");
  });

  it("keeps a cancelled order in the history rather than hiding it", async () => {
    const order = await buyOne();
    await cancelOrder(token, order.id);

    const { content } = await listOrders(token, { size: 50 });

    expect(content.find((row) => row.id === order.id)?.status).toBe("CANCELLED");
  });

  it("refuses a second cancellation with 409 ORDER_CANCELLATION_NOT_ALLOWED", async () => {
    // What a slow double click answers, and the copy the dialog shows.
    const order = await buyOne();
    await cancelOrder(token, order.id);

    const error = await cancelOrder(token, order.id).catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(409);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.ORDER_CANCELLATION_NOT_ALLOWED);
  });

  it("hides another customer's order behind 403 ORDER_ACCESS_DENIED", async () => {
    // A 403, not a 404 — measured 2026-08-05. The page still renders "not
    // found", so as not to confirm the id to a stranger, but the distinction has
    // to stay visible at this layer.
    const { order } = await foreignOrder();

    const error = await getOrder(token, order.id).catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(403);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.ORDER_ACCESS_DENIED);
    // A permission failure, not a dead session: it must not trigger a refresh.
    expect(isApiError(error) && error.isSessionProblem).toBe(false);
  });

  it("refuses to cancel another customer's order, leaving it untouched", async () => {
    const { adminToken, order } = await foreignOrder();

    const error = await cancelOrder(token, order.id).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.ORDER_ACCESS_DENIED);
    // The important half: the refusal is real, not cosmetic.
    const stillThere = await getOrder(adminToken, order.id);
    expect(stillThere.status).toBe(order.status);
  });

  it("400s a malformed order id, naming the parameter", async () => {
    const error = await apiFetch("/api/v1/orders/nao-e-uuid", {
      method: "DELETE",
      accessToken: token,
    }).catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(400);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.INVALID_PARAMETER);
    expect(isApiError(error) && error.messagesFor("orderId")).toBeDefined();
  });
});
