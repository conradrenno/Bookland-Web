import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, formatPrice, formatRating } from "./format";

// pt-BR separates the symbol from the amount with a non-breaking space. Spelled
// out here so a change in that byte fails loudly instead of looking like a typo.
const NBSP = " ";

describe("formatPrice", () => {
  it("renders BRL the pt-BR way", () => {
    expect(formatPrice(44.9)).toBe(`R$${NBSP}44,90`);
  });

  it("groups thousands with a dot", () => {
    expect(formatPrice(1234.5)).toBe(`R$${NBSP}1.234,50`);
  });

  it("keeps a free item as a price, not as a missing value", () => {
    expect(formatPrice(0)).toBe(`R$${NBSP}0,00`);
  });

  it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY])(
    "renders %j as a dash rather than NaN",
    (value) => {
      expect(formatPrice(value)).toBe("—");
    },
  );
});

describe("formatDate", () => {
  it("renders an ISO instant in the store's timezone", () => {
    expect(formatDate("2026-07-28T14:30:00Z")).toBe("28/07/2026");
  });

  it("pins the timezone rather than following the runtime", () => {
    // 02:30 UTC is still the 27th in São Paulo. Reading this as the 28th would
    // mean the date shifts between server render and browser hydration.
    expect(formatDate("2026-07-28T02:30:00Z")).toBe("27/07/2026");
  });

  it.each([undefined, null, "", "not-a-date"])("renders %j as a dash", (value) => {
    expect(formatDate(value)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("adds the time to the date", () => {
    expect(formatDateTime("2026-07-28T14:30:00Z")).toBe("28/07/2026, 11:30");
  });
});

describe("formatRating", () => {
  it("renders one decimal with a comma", () => {
    expect(formatRating(4.5)).toBe("4,5");
    expect(formatRating(4)).toBe("4,0");
  });

  it("treats the upstream's 0.0 as 'no rating yet', not as zero stars", () => {
    // Reviews are 1..5, so 0 only ever means nobody has reviewed the book.
    expect(formatRating(0)).toBeNull();
  });

  it.each([undefined, null, Number.NaN])("renders %j as no rating", (value) => {
    expect(formatRating(value)).toBeNull();
  });
});
