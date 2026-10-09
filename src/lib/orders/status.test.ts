import { describe, expect, it } from "vitest";

import type { OrderStatus } from "@/lib/api/types";
import { describeOrderStatus, isCancellable } from "./status";

const ALL: OrderStatus[] = [
  "PENDING",
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "PAYMENT_FAILED",
  "REJECTED",
];

describe("describeOrderStatus", () => {
  it("names every status in the contract, in pt-BR", () => {
    for (const status of ALL) {
      const { label } = describeOrderStatus(status);
      expect(label).not.toBe("");
      // The raw enum value would mean nothing to a customer.
      expect(label).not.toBe(status);
    }
  });

  it("gives each status a tone without relying on colour alone", () => {
    for (const status of ALL) {
      const { className, label } = describeOrderStatus(status);
      expect(className).toContain("text-");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the raw value for a status added after this was written", () => {
    // The API owns this vocabulary; a new status must not blank the badge.
    const result = describeOrderStatus("RETURNED" as OrderStatus);

    expect(result.label).toBe("RETURNED");
    expect(result.cancellable).toBe(false);
  });
});

describe("isCancellable", () => {
  it("allows cancelling only a confirmed order", () => {
    expect(isCancellable("CONFIRMED")).toBe(true);
  });

  it("refuses while the checkout is still running", () => {
    // The backend answers ORDER_CANCELLATION_NOT_ALLOWED for both (docs/specs/21).
    expect(isCancellable("PENDING")).toBe(false);
    expect(isCancellable("AWAITING_PAYMENT")).toBe(false);
  });

  it("refuses once the order left, ended or failed", () => {
    expect(isCancellable("SHIPPED")).toBe(false);
    expect(isCancellable("DELIVERED")).toBe(false);
    expect(isCancellable("CANCELLED")).toBe(false);
    expect(isCancellable("PAYMENT_FAILED")).toBe(false);
    expect(isCancellable("REJECTED")).toBe(false);
  });

  it("never offers the action for a status it does not know", () => {
    expect(isCancellable("RETURNED" as OrderStatus)).toBe(false);
  });
});
