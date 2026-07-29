/**
 * Links that change one thing about the catalogue view and keep the rest.
 *
 * The catalogue's whole state lives in the query string, so every control —
 * sort, category, pager, price range — is really "the current URL, with one
 * thing changed". Doing that by hand in each component is how a filter quietly
 * resets the page number, or how paging drops the search term.
 *
 * Inverse of `parseBookSearchParams` (lib/api/books.ts): that one reads the URL
 * for the upstream, this one writes it for the browser. Pure — no router, no
 * `window` — so the rules are testable on their own.
 */

import { DEFAULT_PAGE_SIZE } from "@/lib/config";
import { DEFAULT_BOOK_SORT } from "@/lib/api/books";
import type { BookSearchParams } from "@/lib/api/types";

/** The catalogue lives at the site root. */
export const CATALOG_PATH = "/";

/**
 * Values that fall out of the URL entirely when they are the default, so a
 * pristine catalogue link stays `/` instead of `/?sort=title&page=0&size=20`.
 */
const OMITTED_WHEN_DEFAULT: Partial<Record<keyof BookSearchParams, unknown>> = {
  sort: DEFAULT_BOOK_SORT,
  page: 0,
  size: DEFAULT_PAGE_SIZE,
};

/**
 * Changes to apply. `null` clears a parameter — distinct from `undefined`, which
 * means "leave it alone"; without that distinction there is no way to express
 * "remove the category filter".
 */
export type CatalogPatch = {
  [K in keyof BookSearchParams]?: BookSearchParams[K] | null;
};

/**
 * Filters whose change invalidates the current page number.
 *
 * Being on page 4 of "science fiction" and switching to a category with two
 * books would otherwise land the visitor on an empty page they did not ask for.
 * `size` counts too: the same offset means something different per page size.
 */
const RESETS_PAGE: ReadonlySet<keyof BookSearchParams> = new Set([
  "q",
  "category",
  "minPrice",
  "maxPrice",
  "sort",
  "size",
]);

/**
 * Builds a catalogue href from the active parameters plus the change requested.
 *
 * `current` is what `parseBookSearchParams` produced, so it is already clean —
 * this never re-validates, it only merges and serialises.
 */
export function buildCatalogHref(
  current: BookSearchParams,
  patch: CatalogPatch = {},
  path: string = CATALOG_PATH,
): string {
  const merged: BookSearchParams = { ...current };

  for (const [key, value] of Object.entries(patch) as [keyof BookSearchParams, unknown][]) {
    if (value === null || value === undefined || value === "") {
      delete merged[key];
    } else {
      Object.assign(merged, { [key]: value });
    }
  }

  // Any filter change sends the visitor back to the first page — unless the
  // patch set the page itself, which is the pager saying where to go.
  const changesAFilter = Object.keys(patch).some((key) =>
    RESETS_PAGE.has(key as keyof BookSearchParams),
  );
  if (changesAFilter && patch.page === undefined) delete merged.page;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === "") continue;
    if (OMITTED_WHEN_DEFAULT[key as keyof BookSearchParams] === value) continue;
    query.set(key, String(value));
  }

  const serialised = query.toString();
  return serialised ? `${path}?${serialised}` : path;
}

/**
 * Turns a `URLSearchParams` into the raw record `parseBookSearchParams` reads.
 *
 * Uses `getAll`, so a repeated key stays an array. `Object.fromEntries` would
 * silently keep only the last one — and "repeated parameter" is precisely the
 * case the parser refuses rather than guesses at.
 */
export function searchParamsToRecord(
  searchParams: URLSearchParams,
): Record<string, string | string[] | undefined> {
  const record: Record<string, string | string[] | undefined> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    record[key] = values.length > 1 ? values : values[0];
  }
  return record;
}

/** True when the visitor narrowed the catalogue in any way. */
export function hasActiveFilters(params: BookSearchParams): boolean {
  return (
    params.q !== undefined ||
    params.category !== undefined ||
    params.minPrice !== undefined ||
    params.maxPrice !== undefined
  );
}
