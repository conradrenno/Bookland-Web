/**
 * Contract smoke tests — the only suite that talks to a real Spring.
 *
 * Opt-in via `pnpm test:smoke` with the backend up on :8080; excluded from
 * `pnpm test` so a stopped backend never reddens the unit suite. Purpose is to
 * catch the API drifting away from what docs/specs/09-contract-notes.md records,
 * which unit tests against MSW stubs cannot see.
 *
 * Uses the dev-profile admin seed (see application.yml `bookland.admin.*`).
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getBook, searchBooks } from "./books";
import { addCartItem, cartItemCount, getCart, removeCartItem, updateCartItem } from "./cart";
import { listCategories, listCategoryBooks } from "./categories";
import { apiFetch } from "./client";
import { ErrorCodes } from "./error-codes";
import { isApiError } from "./errors";
import { checkout, getOrder } from "./orders";
import { getOrderPayment } from "./payments";
import type { BookViewModel, PageResult, TokenViewModel } from "./types";

/** An id of the right shape that nothing is seeded with. */
const ABSENT_ID = "00000000-0000-0000-0000-000000000000";

const ADMIN = { email: "admin@bookland.com", password: "admin1234" };

/**
 * The other seeded account (backend README). The checkout tests run as this one
 * because buying is a customer's journey, and the admin only ever reaches routes
 * the storefront never touches.
 */
const CUSTOMER = { email: "joao@bookland.com", password: "joao1234" };

async function signInAs(credentials: { email: string; password: string }): Promise<string> {
  const token = await apiFetch<TokenViewModel>("/api/v1/auth/login", {
    method: "POST",
    body: credentials,
  });
  return token.accessToken;
}

function signIn(): Promise<string> {
  return signInAs(ADMIN);
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
    }).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(isApiError(error) && error.messagesFor("email")).toBeDefined();
    expect(isApiError(error) && error.isFieldScoped).toBe(true);
  });

  it("login + authenticated GET + 204 logout", async () => {
    const token = await apiFetch<TokenViewModel>("/api/v1/auth/login", {
      method: "POST",
      body: { email: "admin@bookland.com", password: "admin1234" },
    });
    expect(token.accessToken).toBeTruthy();

    const cart = await apiFetch<{ customerId: string }>("/api/v1/cart", {
      accessToken: token.accessToken,
    });
    expect(cart.customerId).toBeTruthy();

    const logout = await apiFetch<void>("/api/v1/auth/logout", {
      method: "POST",
      body: { refreshToken: token.refreshToken },
    });
    expect(logout).toBeUndefined();
  });

  it("an invalid token is a refreshable session problem, not a permission one", async () => {
    const error = await apiFetch("/api/v1/admin/orders", {
      accessToken: "garbage.token.here",
    }).catch((e: unknown) => e);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.TOKEN_INVALID);
    expect(isApiError(error) && error.shouldAttemptRefresh).toBe(true);
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
    token = await signIn();
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
    token = await signInAs(CUSTOMER);
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

  it("charges on the spot: the order comes back CONFIRMED and paid", async () => {
    // The story said PENDING and the spec guessed AWAITING_PAYMENT. Neither: the
    // payment happens inside this call, so there is no payment step to build.
    await addCartItem(token, book.id, 2);

    const order = await checkout(token, "PIX");

    expect(order.status).toBe("CONFIRMED");
    expect(order.items).toHaveLength(1);
    expect(order.totalAmount).toBeCloseTo(book.price * 2, 2);
    expect(order.statusHistory).toContainEqual(
      expect.objectContaining({ fromStatus: "AWAITING_PAYMENT", toStatus: "CONFIRMED" }),
    );

    // The same order is readable afterwards, and the payment record exists with
    // the method the customer chose — which the order itself does not carry.
    const fetched = await getOrder(token, order.id);
    expect(fetched.id).toBe(order.id);

    const payment = await getOrderPayment(token, order.id);
    expect(payment).toMatchObject({ orderId: order.id, method: "PIX", status: "APPROVED" });
  });

  it("empties the cart, leaving it usable rather than gone", async () => {
    await addCartItem(token, book.id, 1);
    await checkout(token, "CREDIT_CARD");

    const cart = await getCart(token);
    expect(cart.items).toEqual([]);
    expect(cart.total).toBe(0);
  });

  it("answers 404 CART_NOT_FOUND when there is nothing to buy", async () => {
    // Not a 409, and it says this even though `GET /cart` happily returns an
    // empty cart at the same moment. It is why /checkout redirects instead.
    const error = await checkout(token, "PIX").catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(404);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.CART_NOT_FOUND);
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
    const order = await checkout(token, "PIX");

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
