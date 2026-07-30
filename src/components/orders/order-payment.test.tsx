import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PaymentViewModel } from "@/lib/api/types";
import { OrderPayment } from "./order-payment";

const PAYMENT: PaymentViewModel = {
  id: "7577a37c-0244-40fa-be1f-de8878043b8a",
  orderId: "f8bbf26e-28bb-46e0-a0a2-4aba8e674026",
  customerId: "224d5247-205a-4c88-868b-80672a010493",
  amount: 139.8,
  method: "PIX",
  status: "APPROVED",
  gatewayTransactionId: "SIM-1759835a-4e42-4f9c-8c01-646a62bcc6d5",
  createdAt: "2026-07-30T19:55:57.118195Z",
  updatedAt: "2026-07-30T19:55:57.118195Z",
};

describe("OrderPayment", () => {
  it("tells the customer how they paid — the order itself cannot", () => {
    render(<OrderPayment payment={PAYMENT} />);

    expect(screen.getByText("PIX")).toBeInTheDocument();
    expect(screen.getByText("Aprovado")).toBeInTheDocument();
    expect(screen.getByText(/^R\$.139,80$/)).toBeInTheDocument();
  });

  it("keeps the gateway's reference out of sight", () => {
    // `SIM-…` is a simulator's marker and means nothing to a customer.
    render(<OrderPayment payment={PAYMENT} />);

    expect(screen.queryByText(/SIM-/)).not.toBeInTheDocument();
  });

  it("says a refund happened, which is how a cancellation ends", () => {
    render(<OrderPayment payment={{ ...PAYMENT, status: "REFUNDED" }} />);

    expect(screen.getByText("Estornado")).toBeInTheDocument();
  });

  it("names the card methods in full", () => {
    render(<OrderPayment payment={{ ...PAYMENT, method: "CREDIT_CARD" }} />);

    expect(screen.getByText("Cartão de crédito")).toBeInTheDocument();
  });
});
