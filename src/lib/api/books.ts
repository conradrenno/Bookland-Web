/**
 * Catalogue endpoints — `GET /api/v1/books` and friends.
 *
 * Two jobs: call the upstream (`searchBooks`, `getBook`), and turn the raw query
 * string of a catalogue URL into parameters the upstream accepts
 * (`parseBookSearchParams`). Server-side use, except the parser, which is pure.
 *
 * Covers US-05 and US-06 — docs/specs/03-catalog.md.
 */

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/config";
import { apiFetch } from "./client";
import type { BookSearchParams, BookViewModel, PageResult, UUID } from "./types";
import { isUuid } from "./uuid";

const BOOKS_PATH = "/api/v1/books";

/** Paginated catalogue listing, with search and filters applied upstream. */
export function searchBooks(params: BookSearchParams = {}): Promise<PageResult<BookViewModel>> {
  return apiFetch<PageResult<BookViewModel>>(BOOKS_PATH, { query: params });
}

/**
 * One book by id.
 *
 * Rejects with `ApiError` 404 / `BOOK_NOT_FOUND` when it does not exist — the
 * detail page turns that into `notFound()`.
 */
export function getBook(bookId: UUID): Promise<BookViewModel> {
  return apiFetch<BookViewModel>(`${BOOKS_PATH}/${encodeURIComponent(bookId)}`);
}

// ---- Catalogue URL → upstream query ---------------------------------------

/**
 * Sort values the storefront offers (US-05: price, title, average rating).
 *
 * Kept here rather than in `types.ts` because it is a product decision, not part
 * of the contract: upstream types `sort` as a plain string and *silently ignores*
 * one it does not know — `?sort=bogus` answers 200 in title order. So an
 * unrecognised value is never an error to report, only one to discard.
 */
export const BOOK_SORTS = ["title", "price", "rating"] as const;
export type BookSort = (typeof BOOK_SORTS)[number];
export const DEFAULT_BOOK_SORT: BookSort = "title";

/** The shape Next hands a page as `searchParams`: raw, repeatable, untrusted. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Reads the catalogue query string into upstream parameters, dropping anything
 * unusable.
 *
 * This is what keeps a hand-edited URL from becoming an error page: the upstream
 * answers `400 INVALID_PARAMETER` to `?category=abc` or `?minPrice=xyz`, and
 * honours `?size=1000` literally. Silently ignoring a junk filter shows the
 * visitor a catalogue; forwarding it shows them a stack of nothing.
 *
 * `sort`, `page` and `size` always come back resolved, so the page can render
 * the active sort and the pager without repeating the defaults.
 */
export function parseBookSearchParams(raw: RawSearchParams = {}): BookSearchParams {
  return {
    q: parseQuery(single(raw.q)),
    category: parseCategory(single(raw.category)),
    minPrice: parsePrice(single(raw.minPrice)),
    maxPrice: parsePrice(single(raw.maxPrice)),
    sort: parseSort(single(raw.sort)),
    page: parsePage(single(raw.page)),
    size: parseSize(single(raw.size)),
  };
}

/**
 * A repeated parameter (`?sort=price&sort=rating`) arrives as an array. Refuse
 * the whole value rather than picking one: guessing is how a check that reads
 * only the first entry gets walked past — same rule as `resolveAfterAuthPath`.
 */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseQuery(value: string | undefined): string | undefined {
  const term = value?.trim();
  return term ? term : undefined;
}

function parseCategory(value: string | undefined): UUID | undefined {
  return isUuid(value) ? value : undefined;
}

/** Negative prices are dropped rather than clamped — they mean the URL is junk. */
function parsePrice(value: string | undefined): number | undefined {
  const price = toFiniteNumber(value);
  return price !== undefined && price >= 0 ? price : undefined;
}

function parseSort(value: string | undefined): BookSort {
  return BOOK_SORTS.includes(value as BookSort) ? (value as BookSort) : DEFAULT_BOOK_SORT;
}

/** Zero-based, matching the contract and `PageResult.page`. */
function parsePage(value: string | undefined): number {
  const page = toFiniteNumber(value);
  return page !== undefined && Number.isInteger(page) && page >= 0 ? page : 0;
}

function parseSize(value: string | undefined): number {
  const size = toFiniteNumber(value);
  if (size === undefined || !Number.isInteger(size) || size < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(size, MAX_PAGE_SIZE);
}

/**
 * `Number("")` is `0` and `Number(" ")` is `0` too, so an empty parameter would
 * pass as a real value without the guard.
 */
function toFiniteNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
