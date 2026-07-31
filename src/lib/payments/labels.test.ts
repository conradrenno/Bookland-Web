import { describe, expect, it } from "vitest";

import { PAYMENT_METHODS, type PaymentStatus } from "@/lib/api/types";
import { describePaymentStatus, labelForPaymentMethod } from "./labels";

describe("labelForPaymentMethod", () => {
  it("names every method the picker can offer", () => {
    // The picker iterates PAYMENT_METHODS; a method without a label would render
    // an empty option.
    for (const method of PAYMENT_METHODS) {
      expect(labelForPaymentMethod(method)).toBeTruthy();
    }
  });

  it("keeps PIX as PIX — a brand name, not a translation", () => {
    expect(labelForPaymentMethod("PIX")).toBe("PIX");
    expect(labelForPaymentMethod("CREDIT_CARD")).toBe("Cartão de crédito");
  });
});

describe("describePaymentStatus", () => {
  it("names each payment state in pt-BR", () => {
    const states: PaymentStatus[] = ["PENDING", "APPROVED", "DECLINED", "REFUNDED"];

    for (const state of states) {
      const { label } = describePaymentStatus(state);
      expect(label).not.toBe(state);
    }
  });

  it("has copy for REFUNDED, which a cancellation produces on its own", () => {
    // Cancelling a CONFIRMED order refunds automatically (backend README).
    expect(describePaymentStatus("REFUNDED").label).toBe("Estornado");
  });

  it("falls back to the raw value rather than showing nothing", () => {
    expect(describePaymentStatus("CHARGEBACK" as PaymentStatus).label).toBe("CHARGEBACK");
  });
});
