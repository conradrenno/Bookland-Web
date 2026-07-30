import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyCart } from "./empty-cart";

describe("EmptyCart", () => {
  it("offers the way back to the catalogue", () => {
    // An empty cart is the normal state of a new customer, not an error — so it
    // gets an invitation and one obvious action.
    render(<EmptyCart />);

    expect(screen.getByRole("heading", { name: "Seu carrinho está vazio" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver o catálogo" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
