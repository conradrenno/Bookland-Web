import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CartButton } from "./cart-button";

function renderButton(props: Partial<Parameters<typeof CartButton>[0]> = {}) {
  return render(<CartButton count={0} signedIn {...props} />);
}

describe("CartButton", () => {
  it("shows the number of books, not the number of lines", () => {
    // Three copies of one title is a badge reading 3 — `cartItemCount` sums
    // quantities, and this component just renders what it is given.
    renderButton({ count: 3 });

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Carrinho, 3 itens" })).toBeInTheDocument();
  });

  it("says 'item' in the singular", () => {
    renderButton({ count: 1 });

    expect(screen.getByRole("link", { name: "Carrinho, 1 item" })).toBeInTheDocument();
  });

  it("shows no badge for an empty cart", () => {
    // A "0" tells the visitor nothing they did not already assume.
    renderButton({ count: 0 });

    expect(screen.getByRole("link", { name: "Carrinho" })).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("caps the badge so it cannot outgrow the icon", () => {
    renderButton({ count: 128 });

    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("links to the cart when signed in", () => {
    renderButton({ count: 2 });

    expect(screen.getByRole("link", { name: /Carrinho/ })).toHaveAttribute("href", "/cart");
  });

  it("sends a signed-out visitor to sign in and back", () => {
    // The cart endpoint needs a token, so there is nothing to show them at
    // `/cart` — and no count to trust either.
    renderButton({ count: 5, signedIn: false });

    const link = screen.getByRole("link", { name: "Carrinho" });
    expect(link).toHaveAttribute("href", "/api/auth/login?next=%2Fcart");
    expect(screen.queryByText("5")).not.toBeInTheDocument();
  });
});
