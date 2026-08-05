import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OrderSummaryViewModel } from "@/lib/api/types";
import { OrderSummaryCard } from "./order-summary-card";

const ORDER_ID = "45bb517d-0ac5-4044-8bac-348572d09a03";

function summary(overrides: Partial<OrderSummaryViewModel> = {}): OrderSummaryViewModel {
  return {
    id: ORDER_ID,
    status: "CONFIRMED",
    totalAmount: 139.8,
    itemCount: 2,
    createdAt: "2026-08-05T18:17:49.830944Z",
    ...overrides,
  };
}

function renderCard(overrides: Partial<OrderSummaryViewModel> = {}) {
  return render(
    <ul>
      <OrderSummaryCard order={summary(overrides)} />
    </ul>,
  );
}

describe("OrderSummaryCard", () => {
  it("makes the whole row the link to the order", () => {
    renderCard();

    expect(screen.getByRole("link")).toHaveAttribute("href", `/orders/${ORDER_ID}`);
  });

  it("shortens the id to something a person can read out", () => {
    renderCard();

    expect(screen.getByRole("link")).toHaveTextContent("Pedido #45bb517d");
    expect(screen.getByRole("link")).not.toHaveTextContent(ORDER_ID);
  });

  it("shows the status in words, not only in colour", () => {
    renderCard({ status: "CANCELLED" });

    expect(screen.getByRole("link")).toHaveTextContent("Cancelado");
  });

  it("formats date and total in pt-BR", () => {
    renderCard();

    expect(screen.getByRole("link")).toHaveTextContent("05/08/2026");
    expect(screen.getByRole("link")).toHaveTextContent("R$ 139,80");
  });

  it("agrees with itself on singular and plural", () => {
    const { unmount } = renderCard({ itemCount: 1 });
    expect(screen.getByRole("link")).toHaveTextContent("1 item");
    unmount();

    renderCard({ itemCount: 3 });
    expect(screen.getByRole("link")).toHaveTextContent("3 itens");
  });

  it("shows no cover, because the listing carries no items", () => {
    // `OrderSummaryViewModel` has `itemCount` and nothing else about the items:
    // a thumbnail here would cost one upstream call per row.
    renderCard();

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
