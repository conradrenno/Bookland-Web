import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BookViewModel } from "@/lib/api/types";
import { BookCard } from "./book-card";

// The card is a Server Component, but the CTA inside it is a client island that
// reads the router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

const BOOK: BookViewModel = {
  id: "92d3c8cb-443a-4501-a593-017bdc843196",
  title: "Clean Code",
  isbn: "9780132350884",
  authors: ["Robert C. Martin"],
  publisher: "Prentice Hall",
  publicationYear: 2008,
  price: 44.9,
  stockQuantity: 20,
  available: true,
  categoryId: "c3d4e5f6-a7b8-9012-cdef-123456789012",
  coverImageUrl: "https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg",
  avgRating: 0,
};

function renderCard(overrides: Partial<BookViewModel> = {}, signedIn = true) {
  return render(<BookCard book={{ ...BOOK, ...overrides }} signedIn={signedIn} />);
}

describe("BookCard", () => {
  it("shows the book and links to its page", () => {
    renderCard();

    expect(screen.getByRole("link", { name: /Clean Code/ })).toHaveAttribute(
      "href",
      `/books/${BOOK.id}`,
    );
    expect(screen.getByText("Robert C. Martin")).toBeInTheDocument();
  });

  it("formats the price in pt-BR", () => {
    renderCard({ price: 1234.5 });

    // The `.` stands in for the separator: pt-BR uses a non-breaking space
    // there, and Testing Library's normaliser does not fold it into a plain one.
    expect(screen.getByText(/^R\$.1\.234,50$/)).toBeInTheDocument();
  });

  it("joins multiple authors", () => {
    renderCard({ authors: ["Erich Gamma", "Richard Helm"] });

    expect(screen.getByText("Erich Gamma, Richard Helm")).toBeInTheDocument();
  });

  it("marks an out-of-stock book instead of hiding it", () => {
    // US-05 is explicit: zero stock stays on the shelf, flagged.
    renderCard({ available: false });

    // Twice over: the badge on the cover, and the disabled CTA below.
    expect(screen.getAllByText("Indisponível")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Clean Code/ })).toBeInTheDocument();
  });

  it("says nothing about stock when the book is available", () => {
    renderCard();

    expect(screen.queryByText("Indisponível")).not.toBeInTheDocument();
  });

  it("renders the cover with the title in its alt text", () => {
    renderCard();

    expect(screen.getByAltText("Capa de Clean Code")).toBeInTheDocument();
  });

  it("falls back to a placeholder rather than a broken image", () => {
    renderCard({ coverImageUrl: undefined });

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // The title appears twice then — once in the placeholder, once as the heading.
    expect(screen.getAllByText("Clean Code").length).toBeGreaterThan(1);
  });

  it("keeps quiet about ratings on an unreviewed book", () => {
    // avgRating 0 means "no reviews", so a card must not show five empty stars
    // — nor spend a line on saying there are none.
    renderCard({ avgRating: 0 });

    expect(screen.queryByText("Sem avaliações")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/estrelas/)).not.toBeInTheDocument();
  });

  it("shows the score once the book has one", () => {
    renderCard({ avgRating: 4.5 });

    expect(screen.getByLabelText("4,5 de 5 estrelas")).toBeInTheDocument();
  });

  describe("the cart action", () => {
    it("is in the DOM regardless of hover", () => {
      // The reveal is CSS (opacity + a hover media query), never conditional
      // rendering — which is what keeps it reachable by keyboard and present on
      // a touch screen, where hover does not exist.
      renderCard();

      expect(screen.getByRole("button", { name: /Adicionar ao carrinho/ })).toBeInTheDocument();
    });

    it("sends a signed-out visitor to sign in, carrying where they were", () => {
      renderCard({}, false);

      const cta = screen.getByRole("link", { name: /Adicionar ao carrinho/ });
      // usePathname is mocked to "/", the catalogue — and "/" is the default
      // landing, so `withNextParam` leaves the query off entirely.
      expect(cta).toHaveAttribute("href", "/login");
    });

    it("offers no purchase for a book that is out of stock", () => {
      renderCard({ available: false });

      expect(
        screen.queryByRole("button", { name: /Adicionar ao carrinho/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Indisponível" })).toBeDisabled();
    });

    it("keeps the CTA out of the anchor that covers the card", () => {
      // A <button> inside an <a> is invalid HTML, and it would make a click
      // ambiguous: buy the book, or open its page?
      renderCard();

      const cta = screen.getByRole("button", { name: /Adicionar ao carrinho/ });
      expect(cta.closest("a")).toBeNull();
    });
  });
});
