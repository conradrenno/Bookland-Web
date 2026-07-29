import { describe, expect, it } from "vitest";

import { parseBookSearchParams } from "@/lib/api/books";
import { buildCatalogHref, hasActiveFilters } from "./search-href";

const CATEGORY_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

/** Round-trips through the parser, the way a page actually gets its params. */
function fromUrl(query: Record<string, string>) {
  return parseBookSearchParams(query);
}

describe("buildCatalogHref", () => {
  it("keeps a pristine catalogue at /, without echoing the defaults", () => {
    expect(buildCatalogHref(fromUrl({}))).toBe("/");
  });

  it("preserves the search term while changing the sort", () => {
    const href = buildCatalogHref(fromUrl({ q: "duna" }), { sort: "price" });

    expect(href).toBe("/?q=duna&sort=price");
  });

  it("drops a parameter set back to its default", () => {
    const href = buildCatalogHref(fromUrl({ q: "duna", sort: "price" }), { sort: "title" });

    expect(href).toBe("/?q=duna");
  });

  it("clears a filter when the patch is null", () => {
    const href = buildCatalogHref(fromUrl({ q: "duna", category: CATEGORY_ID }), {
      category: null,
    });

    expect(href).toBe("/?q=duna");
  });

  it("returns to the first page when a filter changes", () => {
    // Page 4 of one category is meaningless in another — it can be past the end.
    const href = buildCatalogHref(fromUrl({ page: "4", q: "duna" }), { category: CATEGORY_ID });

    expect(href).toBe(`/?q=duna&category=${CATEGORY_ID}`);
  });

  it("honours the pager, which is the one thing allowed to set a page", () => {
    const href = buildCatalogHref(fromUrl({ q: "duna" }), { page: 2 });

    expect(href).toBe("/?q=duna&page=2");
  });

  it("resets the page when the page size changes", () => {
    const href = buildCatalogHref(fromUrl({ page: "3" }), { size: 40 });

    expect(href).toBe("/?size=40");
  });

  it("keeps every other filter while paging", () => {
    const current = fromUrl({
      q: "clean",
      category: CATEGORY_ID,
      minPrice: "10",
      maxPrice: "80",
      sort: "price",
    });

    const href = buildCatalogHref(current, { page: 1 });

    const query = new URL(href, "http://x.test").searchParams;
    expect(Object.fromEntries(query)).toEqual({
      q: "clean",
      category: CATEGORY_ID,
      minPrice: "10",
      maxPrice: "80",
      sort: "price",
      page: "1",
    });
  });

  it("treats an empty string like a removal, since that is what a cleared input sends", () => {
    const href = buildCatalogHref(fromUrl({ q: "duna" }), { q: "" });

    expect(href).toBe("/");
  });

  it("escapes a term that would otherwise break the query string", () => {
    const href = buildCatalogHref(fromUrl({}), { q: "arte & ofício" });

    expect(href).toBe("/?q=arte+%26+of%C3%ADcio");
    expect(new URL(href, "http://x.test").searchParams.get("q")).toBe("arte & ofício");
  });

  it("can point at another path, for a category-scoped listing", () => {
    expect(buildCatalogHref(fromUrl({ q: "duna" }), {}, "/categories")).toBe("/categories?q=duna");
  });

  it("leaves parameters the patch does not mention untouched", () => {
    const href = buildCatalogHref(fromUrl({ q: "duna", minPrice: "10" }), {});

    expect(href).toBe("/?q=duna&minPrice=10");
  });
});

describe("hasActiveFilters", () => {
  it("is false for a pristine catalogue, defaults included", () => {
    expect(hasActiveFilters(fromUrl({ sort: "price", page: "2" }))).toBe(false);
  });

  it.each([
    ["q", { q: "duna" }],
    ["category", { category: CATEGORY_ID }],
    ["minPrice", { minPrice: "10" }],
    ["maxPrice", { maxPrice: "80" }],
  ])("is true once %s narrows the list", (_label, query) => {
    expect(hasActiveFilters(fromUrl(query))).toBe(true);
  });
});
