import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseBookSearchParams } from "@/lib/api/books";
import { Pagination } from "./pagination";

const CATEGORY_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("Pagination", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = render(
      <Pagination params={parseBookSearchParams({})} page={0} totalPages={1} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("numbers pages from one, though the contract counts from zero", () => {
    render(<Pagination params={parseBookSearchParams({})} page={0} totalPages={3} />);

    expect(screen.getByRole("link", { name: "Página 2" })).toHaveAttribute("href", "/?page=1");
    // The first page is the default, so it carries no `page` parameter at all.
    expect(screen.getByRole("link", { name: "Página 1" })).toHaveAttribute("href", "/");
  });

  it("marks the current page for assistive tech", () => {
    render(<Pagination params={parseBookSearchParams({ page: "1" })} page={1} totalPages={3} />);

    expect(screen.getByRole("link", { name: "Página 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("carries the active filters into every page link", () => {
    const params = parseBookSearchParams({ q: "clean", category: CATEGORY_ID, sort: "price" });

    render(<Pagination params={params} page={0} totalPages={3} />);

    const href = screen.getByRole("link", { name: "Página 2" }).getAttribute("href")!;
    expect(Object.fromEntries(new URL(href, "http://x.test").searchParams)).toEqual({
      q: "clean",
      category: CATEGORY_ID,
      sort: "price",
      page: "1",
    });
  });

  it("offers no link past either end", () => {
    render(<Pagination params={parseBookSearchParams({})} page={0} totalPages={3} />);

    expect(screen.queryByRole("link", { name: "Página anterior" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Próxima página" })).toBeInTheDocument();
  });

  it("drops the next link on the last page", () => {
    render(<Pagination params={parseBookSearchParams({ page: "2" })} page={2} totalPages={3} />);

    expect(screen.getByRole("link", { name: "Página anterior" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Próxima página" })).not.toBeInTheDocument();
  });

  it("collapses a long run of pages instead of listing all of them", () => {
    render(<Pagination params={parseBookSearchParams({ page: "45" })} page={45} totalPages={90} />);

    // First and last stay reachable in one click; the middle is windowed.
    expect(screen.getByRole("link", { name: "Página 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Página 90" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Página 20" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").length).toBeLessThan(12);
  });
});
