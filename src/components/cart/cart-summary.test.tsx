import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CartSummary } from "./cart-summary";

describe("CartSummary", () => {
  it("leads to the checkout once there is something to buy", () => {
    render(<CartSummary total={139.8} itemCount={2} />);

    expect(screen.getByRole("link", { name: "Finalizar compra" })).toHaveAttribute(
      "href",
      "/checkout",
    );
  });

  it("closes the way out while a line is unavailable", () => {
    // The upstream would refuse the order with a 409; better to say so here than
    // to bounce someone off a payment page.
    render(<CartSummary total={139.8} itemCount={2} hasUnavailableItem />);

    expect(screen.queryByRole("link", { name: "Finalizar compra" })).not.toBeInTheDocument();
    // A disabled <button>, not a dimmed link: a link stays followable by
    // keyboard and by right-click.
    expect(screen.getByRole("button", { name: "Finalizar compra" })).toBeDisabled();
    expect(screen.getByText("Remova os itens indisponíveis para continuar.")).toBeInTheDocument();
  });

  it("shows the API's total rather than adding the lines up again", () => {
    render(<CartSummary total={1234.5} itemCount={3} />);

    // Twice: once on the item line, once as the total.
    expect(screen.getAllByText(/^R\$.1\.234,50$/)).toHaveLength(2);
    expect(screen.getByText("3 itens")).toBeInTheDocument();
  });

  it("says item in the singular", () => {
    render(<CartSummary total={69.9} itemCount={1} />);

    expect(screen.getByText("1 item")).toBeInTheDocument();
  });
});
