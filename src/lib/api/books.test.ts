import { http, HttpResponse, type DefaultBodyType, type StrictRequest } from "msw";
import { describe, expect, it } from "vitest";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/config";
import { server } from "@/test/msw";
import { DEFAULT_BOOK_SORT, getBook, parseBookSearchParams, searchBooks } from "./books";
import { ErrorCodes } from "./error-codes";
import { isApiError } from "./errors";
import type { BookViewModel, PageResult } from "./types";

const BASE = "http://localhost:8080";

/** A seeded id from the running catalogue — see the note in `uuid.ts`. */
const CATEGORY_ID = "c3d4e5f6-a7b8-9012-cdef-123456789012";
const BOOK_ID = "92d3c8cb-443a-4501-a593-017bdc843196";

const emptyPage: PageResult<BookViewModel> = {
  content: [],
  page: 0,
  size: 20,
  totalElements: 0,
  totalPages: 0,
};

/** Stubs a listing endpoint and hands back the query string MSW actually saw. */
function captureQuery(path: string) {
  const seen: { request?: StrictRequest<DefaultBodyType> } = {};
  server.use(
    http.get(`${BASE}${path}`, ({ request }) => {
      seen.request = request.clone();
      return HttpResponse.json(emptyPage);
    }),
  );
  return () => new URL(seen.request!.url).searchParams;
}

describe("searchBooks", () => {
  it("never sends a token: the catalogue is public, and a stale one would 401", async () => {
    // Since the API became a resource server, an expired or corrupt token fails
    // the request even on a public route (docs/specs/21, R2).
    const seen: { auth?: string | null } = {};
    server.use(
      http.get(`${BASE}/api/v1/books`, ({ request }) => {
        seen.auth = request.headers.get("Authorization");
        return HttpResponse.json(emptyPage);
      }),
    );

    await searchBooks({});

    expect(seen.auth).toBeNull();
  });

  it("returns the page as the upstream sent it", async () => {
    const page: PageResult<BookViewModel> = { ...emptyPage, page: 1, totalElements: 5, totalPages: 3 };
    server.use(http.get(`${BASE}/api/v1/books`, () => HttpResponse.json(page)));

    await expect(searchBooks({ page: 1, size: 2 })).resolves.toEqual(page);
  });

  it("puts every filter on the query string", async () => {
    const query = captureQuery("/api/v1/books");

    await searchBooks({
      q: "duna",
      category: CATEGORY_ID,
      minPrice: 10,
      maxPrice: 99.9,
      sort: "price",
      page: 2,
      size: 12,
    });

    expect(Object.fromEntries(query())).toEqual({
      q: "duna",
      category: CATEGORY_ID,
      minPrice: "10",
      maxPrice: "99.9",
      sort: "price",
      page: "2",
      size: "12",
    });
  });

  it("sends no parameters at all when given none", async () => {
    const query = captureQuery("/api/v1/books");

    await searchBooks();

    expect([...query()]).toEqual([]);
  });

  it("keeps page=0, which is the first page and not an absent value", async () => {
    const query = captureQuery("/api/v1/books");

    await searchBooks({ page: 0 });

    expect(query().get("page")).toBe("0");
  });
});

describe("getBook", () => {
  it("fetches by id", async () => {
    server.use(
      http.get(`${BASE}/api/v1/books/${BOOK_ID}`, () =>
        HttpResponse.json({ id: BOOK_ID, title: "Clean Code" }),
      ),
    );

    await expect(getBook(BOOK_ID)).resolves.toMatchObject({ title: "Clean Code" });
  });

  it("surfaces a missing book as ApiError 404 BOOK_NOT_FOUND, for notFound()", async () => {
    server.use(
      http.get(`${BASE}/api/v1/books/${BOOK_ID}`, () =>
        HttpResponse.json(
          {
            status: 404,
            title: "Not Found",
            detail: `Book not found: ${BOOK_ID}`,
            code: ErrorCodes.BOOK_NOT_FOUND,
            instance: `/api/v1/books/${BOOK_ID}`,
          },
          { status: 404, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const error = await getBook(BOOK_ID).catch((caught: unknown) => caught);

    expect(isApiError(error) && error.isNotFound).toBe(true);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.BOOK_NOT_FOUND);
  });

  it("escapes the id instead of pasting it into the path", async () => {
    const seen: { path?: string } = {};
    server.use(
      http.get(`${BASE}/api/v1/books/:bookId`, ({ request }) => {
        seen.path = new URL(request.url).pathname;
        return HttpResponse.json({});
      }),
    );

    await getBook("../../admin/orders");

    expect(seen.path).toBe("/api/v1/books/..%2F..%2Fadmin%2Forders");
  });
});

describe("parseBookSearchParams", () => {
  it("passes clean parameters through", () => {
    expect(
      parseBookSearchParams({
        q: "duna",
        category: CATEGORY_ID,
        minPrice: "10",
        maxPrice: "99.9",
        sort: "price",
        page: "2",
        size: "12",
      }),
    ).toEqual({
      q: "duna",
      category: CATEGORY_ID,
      minPrice: 10,
      maxPrice: 99.9,
      sort: "price",
      page: 2,
      size: 12,
    });
  });

  it("resolves sort, page and size even when the URL is empty", () => {
    expect(parseBookSearchParams({})).toEqual({
      q: undefined,
      category: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      sort: DEFAULT_BOOK_SORT,
      page: 0,
      size: DEFAULT_PAGE_SIZE,
    });
  });

  it("drops a malformed category, which the upstream would answer with 400", () => {
    expect(parseBookSearchParams({ category: "not-a-uuid" }).category).toBeUndefined();
  });

  it("keeps a seeded category id, whose version nibble is not RFC-4122", () => {
    expect(parseBookSearchParams({ category: CATEGORY_ID }).category).toBe(CATEGORY_ID);
  });

  it.each(["abc", "", "   ", "-5", "NaN"])("drops the unusable price %j", (value) => {
    expect(parseBookSearchParams({ minPrice: value }).minPrice).toBeUndefined();
  });

  it("keeps a zero price, which is a real filter bound", () => {
    expect(parseBookSearchParams({ minPrice: "0" }).minPrice).toBe(0);
  });

  it("falls back to the default sort for a value the storefront does not offer", () => {
    expect(parseBookSearchParams({ sort: "bogus" }).sort).toBe(DEFAULT_BOOK_SORT);
  });

  it.each(["-1", "1.5", "abc", ""])("falls back to page 0 for %j", (value) => {
    expect(parseBookSearchParams({ page: value }).page).toBe(0);
  });

  it("caps size, since the upstream honours ?size=1000 literally", () => {
    expect(parseBookSearchParams({ size: "1000" }).size).toBe(MAX_PAGE_SIZE);
  });

  it.each(["0", "-3", "abc"])("falls back to the default size for %j", (value) => {
    expect(parseBookSearchParams({ size: value }).size).toBe(DEFAULT_PAGE_SIZE);
  });

  it("trims the search term and treats a blank one as absent", () => {
    expect(parseBookSearchParams({ q: "  duna  " }).q).toBe("duna");
    expect(parseBookSearchParams({ q: "   " }).q).toBeUndefined();
  });

  it("refuses a repeated parameter entirely rather than picking one value", () => {
    const parsed = parseBookSearchParams({
      q: ["duna", "clean"],
      category: [CATEGORY_ID, CATEGORY_ID],
      sort: ["price", "rating"],
    });

    expect(parsed.q).toBeUndefined();
    expect(parsed.category).toBeUndefined();
    expect(parsed.sort).toBe(DEFAULT_BOOK_SORT);
  });

  it("survives being handed nothing", () => {
    expect(parseBookSearchParams().page).toBe(0);
  });
});
