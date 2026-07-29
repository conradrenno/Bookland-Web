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
import { describe, expect, it } from "vitest";

import { getBook, searchBooks } from "./books";
import { listCategories, listCategoryBooks } from "./categories";
import { apiFetch } from "./client";
import { ErrorCodes } from "./error-codes";
import { isApiError } from "./errors";
import type { BookViewModel, PageResult, TokenViewModel } from "./types";

/** An id of the right shape that nothing is seeded with. */
const ABSENT_ID = "00000000-0000-0000-0000-000000000000";

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
