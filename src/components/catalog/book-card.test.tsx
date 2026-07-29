import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { BookViewModel } from "@/lib/api/types";
import { BookCard } from "./book-card";

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

function renderCard(overrides: Partial<BookViewModel> = {}) {
  return render(<BookCard book={{ ...BOOK, ...overrides }} />);
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

    expect(screen.getByText("Indisponível")).toBeInTheDocument();
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
});
