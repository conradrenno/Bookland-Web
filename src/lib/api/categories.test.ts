import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/msw";
import { listCategories, listCategoryBooks } from "./categories";
import { ErrorCodes } from "./error-codes";
import { isApiError } from "./errors";

const BASE = "http://localhost:8080";
const CATEGORY_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("listCategories", () => {
  it("returns the bare array the contract defines, not a page", async () => {
    server.use(
      http.get(`${BASE}/api/v1/categories`, () =>
        HttpResponse.json([
          { id: CATEGORY_ID, name: "Ficção Científica", bookCount: 1 },
          { id: "f6a7b8c9-d0e1-2345-fabc-456789012345", name: "Autoajuda", bookCount: 0 },
        ]),
      ),
    );

    const categories = await listCategories();

    expect(categories).toHaveLength(2);
    expect(categories[0]).toEqual({
      id: CATEGORY_ID,
      name: "Ficção Científica",
      bookCount: 1,
    });
  });
});

describe("listCategoryBooks", () => {
  it("sends only pagination, the sole parameters this endpoint accepts", async () => {
    const seen: { url?: string } = {};
    server.use(
      http.get(`${BASE}/api/v1/categories/${CATEGORY_ID}/books`, ({ request }) => {
        seen.url = request.url;
        return HttpResponse.json({ content: [], page: 1, size: 5, totalElements: 0, totalPages: 0 });
      }),
    );

    await listCategoryBooks(CATEGORY_ID, { page: 1, size: 5 });

    expect(Object.fromEntries(new URL(seen.url!).searchParams)).toEqual({
      page: "1",
      size: "5",
    });
  });

  it("omits pagination when the caller gives none", async () => {
    const seen: { url?: string } = {};
    server.use(
      http.get(`${BASE}/api/v1/categories/${CATEGORY_ID}/books`, ({ request }) => {
        seen.url = request.url;
        return HttpResponse.json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
      }),
    );

    await listCategoryBooks(CATEGORY_ID);

    expect([...new URL(seen.url!).searchParams]).toEqual([]);
  });

  it("surfaces an unknown category as ApiError 404 CATEGORY_NOT_FOUND", async () => {
    server.use(
      http.get(`${BASE}/api/v1/categories/${CATEGORY_ID}/books`, () =>
        HttpResponse.json(
          {
            status: 404,
            title: "Not Found",
            detail: `Category not found: ${CATEGORY_ID}`,
            code: ErrorCodes.CATEGORY_NOT_FOUND,
            instance: `/api/v1/categories/${CATEGORY_ID}/books`,
          },
          { status: 404, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const error = await listCategoryBooks(CATEGORY_ID).catch((caught: unknown) => caught);

    expect(isApiError(error) && error.isNotFound).toBe(true);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.CATEGORY_NOT_FOUND);
  });
});
