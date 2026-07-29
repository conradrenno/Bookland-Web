/**
 * Category endpoints — US-10 (docs/specs/03-catalog.md).
 *
 * Used by the catalogue filters and the header menu (docs/specs/13-common_header.md).
 */

import { apiFetch } from "./client";
import type { BookViewModel, CategoryViewModel, PageResult, UUID } from "./types";

const CATEGORIES_PATH = "/api/v1/categories";

/**
 * Every category, with its `bookCount`.
 *
 * Returns a bare array, not a `PageResult` — the only listing in the contract
 * that is not paginated.
 */
export function listCategories(): Promise<CategoryViewModel[]> {
  return apiFetch<CategoryViewModel[]>(CATEGORIES_PATH);
}

/**
 * Books of one category.
 *
 * ⚠️ Accepts **only** `page`/`size`: no `q`, no `sort`, no price range. So the
 * catalogue page filters through `searchBooks({ category })` instead, which does
 * compose with the other filters; this function is for a category-scoped listing
 * that needs nothing else.
 *
 * Rejects with `ApiError` 404 / `CATEGORY_NOT_FOUND` for an unknown id.
 */
export function listCategoryBooks(
  categoryId: UUID,
  pagination: { page?: number; size?: number } = {},
): Promise<PageResult<BookViewModel>> {
  return apiFetch<PageResult<BookViewModel>>(
    `${CATEGORIES_PATH}/${encodeURIComponent(categoryId)}/books`,
    { query: pagination },
  );
}
