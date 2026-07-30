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
import type { BookViewModel, PageResult, TokenViewModel } from "./types";

/** An id of the right shape that nothing is seeded with. */
const ABSENT_ID = "00000000-0000-0000-0000-000000000000";

const ADMIN = { email: "admin@bookland.com", password: "admin1234" };

async function signIn(): Promise<string> {
  const token = await apiFetch<TokenViewModel>("/api/v1/auth/login", {
    method: "POST",
    body: ADMIN,
  });
  return token.accessToken;
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
