import { describe, expect, it } from "vitest";

import type { OrderStatus } from "@/lib/api/types";
import { describeOrderStatus, isCancellable } from "./status";

const ALL: OrderStatus[] = [
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "PAYMENT_FAILED",
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
  it("allows cancelling before dispatch", () => {
    // Backend README, confirmed live: AWAITING_PAYMENT or CONFIRMED. Since
    // checkout hands back a CONFIRMED order, every new order starts cancellable.
    expect(isCancellable("AWAITING_PAYMENT")).toBe(true);
    expect(isCancellable("CONFIRMED")).toBe(true);
  });

  it("refuses once the order left, ended or failed", () => {
    expect(isCancellable("SHIPPED")).toBe(false);
    expect(isCancellable("DELIVERED")).toBe(false);
    expect(isCancellable("CANCELLED")).toBe(false);
    expect(isCancellable("PAYMENT_FAILED")).toBe(false);
  });

  it("never offers the action for a status it does not know", () => {
    expect(isCancellable("RETURNED" as OrderStatus)).toBe(false);
  });
});
