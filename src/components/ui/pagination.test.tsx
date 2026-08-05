import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseBookSearchParams } from "@/lib/api/books";
import { buildCatalogHref } from "@/lib/catalog/search-href";
import { Pagination } from "./pagination";

const CATEGORY_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

/** The catalogue's wiring, which is the demanding caller: filters ride along. */
function catalogHref(raw: Parameters<typeof parseBookSearchParams>[0] = {}) {
  const params = parseBookSearchParams(raw);
  return (page: number) => buildCatalogHref(params, { page });
}

function renderPager(props: Partial<Parameters<typeof Pagination>[0]> = {}) {
  return render(
    <Pagination
      page={0}
      totalPages={3}
      hrefFor={catalogHref()}
      label="Paginação do catálogo"
      {...props}
    />,
  );
}

describe("Pagination", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = renderPager({ totalPages: 1 });

    expect(container).toBeEmptyDOMElement();
  });

  it("numbers pages from one, though the contract counts from zero", () => {
    renderPager();

    expect(screen.getByRole("link", { name: "Página 2" })).toHaveAttribute("href", "/?page=1");
    // The first page is the default, so it carries no `page` parameter at all.
    expect(screen.getByRole("link", { name: "Página 1" })).toHaveAttribute("href", "/");
  });

  it("marks the current page for assistive tech", () => {
    renderPager({ page: 1, hrefFor: catalogHref({ page: "1" }) });

    expect(screen.getByRole("link", { name: "Página 2" })).toHaveAttribute("aria-current", "page");
  });

  it("leaves the caller in charge of what a page link carries", () => {
    // The pager builds no URLs of its own — this is the whole reason `hrefFor`
    // exists, and what let the order history reuse it without filters.
    renderPager({
      hrefFor: catalogHref({ q: "clean", category: CATEGORY_ID, sort: "price" }),
    });

    const href = screen.getByRole("link", { name: "Página 2" }).getAttribute("href")!;
    expect(Object.fromEntries(new URL(href, "http://x.test").searchParams)).toEqual({
      q: "clean",
      category: CATEGORY_ID,
      sort: "price",
      page: "1",
    });
  });

  it("works for a listing with no query string at all", () => {
    // How `/orders` uses it.
    renderPager({ hrefFor: (page) => (page === 0 ? "/orders" : `/orders?page=${page}`) });

    expect(screen.getByRole("link", { name: "Página 1" })).toHaveAttribute("href", "/orders");
    expect(screen.getByRole("link", { name: "Página 2" })).toHaveAttribute(
      "href",
      "/orders?page=1",
    );
  });

  it("names the listing in its landmark", () => {
    renderPager({ label: "Paginação dos pedidos" });

    expect(screen.getByRole("navigation", { name: "Paginação dos pedidos" })).toBeInTheDocument();
  });

  it("offers no link past either end", () => {
    renderPager();

    expect(screen.queryByRole("link", { name: "Página anterior" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Próxima página" })).toBeInTheDocument();
  });

  it("drops the next link on the last page", () => {
    renderPager({ page: 2, hrefFor: catalogHref({ page: "2" }) });

    expect(screen.getByRole("link", { name: "Página anterior" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Próxima página" })).not.toBeInTheDocument();
  });

  it("collapses a long run of pages instead of listing all of them", () => {
    renderPager({ page: 45, totalPages: 90, hrefFor: catalogHref({ page: "45" }) });

    // First and last stay reachable in one click; the middle is windowed.
    expect(screen.getByRole("link", { name: "Página 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Página 90" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Página 20" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").length).toBeLessThan(12);
  });
});
