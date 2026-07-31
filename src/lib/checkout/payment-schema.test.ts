import { describe, expect, it } from "vitest";

import {
  checkoutSchema,
  formatCardNumber,
  formatExpiry,
  isFutureExpiry,
  isPixKey,
  passesLuhn,
} from "./payment-schema";

/** Everything a card variant needs, valid — tests override one field at a time. */
const CARD = {
  paymentMethod: "CREDIT_CARD" as const,
  cardNumber: "4111 1111 1111 1111",
  cardExpiry: "12/31",
  cardCvv: "123",
  cardHolder: "João da Silva",
  pixKey: "",
  paypalEmail: "",
};

function errorFor(values: Record<string, unknown>, field: string): string | undefined {
  const result = checkoutSchema.safeParse(values);
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("passesLuhn", () => {
  it("accepts the published test numbers", () => {
    expect(passesLuhn("4111111111111111")).toBe(true);
    expect(passesLuhn("5555555555554444")).toBe(true);
  });

  it("rejects a number that is only the right length", () => {
    // The whole point: sixteen digits is not the same as a plausible card.
    expect(passesLuhn("1234567812345678")).toBe(false);
    expect(passesLuhn("4111111111111112")).toBe(false);
  });

  it("rejects an empty string instead of treating it as a zero sum", () => {
    expect(passesLuhn("")).toBe(false);
  });
});

describe("formatCardNumber", () => {
  it("groups digits in fours as they are typed", () => {
    expect(formatCardNumber("4111111111111111")).toBe("4111 1111 1111 1111");
    expect(formatCardNumber("41111")).toBe("4111 1");
  });

  it("drops anything that is not a digit and stops at sixteen", () => {
    expect(formatCardNumber("4111-1111 abc 1111 1111 999")).toBe("4111 1111 1111 1111");
  });
});

describe("formatExpiry", () => {
  it("inserts the slash so it never has to be typed", () => {
    expect(formatExpiry("12")).toBe("12");
    expect(formatExpiry("1229")).toBe("12/29");
    expect(formatExpiry("12/29")).toBe("12/29");
  });
});

describe("isFutureExpiry", () => {
  const now = new Date("2026-07-30T12:00:00Z");

  it("accepts a later year", () => {
    expect(isFutureExpiry("01/27", now)).toBe(true);
  });

  it("accepts the current month, which is still valid until it ends", () => {
    expect(isFutureExpiry("07/26", now)).toBe(true);
  });

  it("rejects last month and last year", () => {
    expect(isFutureExpiry("06/26", now)).toBe(false);
    expect(isFutureExpiry("12/25", now)).toBe(false);
  });

  it("rejects a month that does not exist", () => {
    expect(isFutureExpiry("13/30", now)).toBe(false);
    expect(isFutureExpiry("00/30", now)).toBe(false);
  });

  it("rejects anything not shaped MM/AA", () => {
    expect(isFutureExpiry("1/30", now)).toBe(false);
    expect(isFutureExpiry("12-30", now)).toBe(false);
  });
});

describe("isPixKey", () => {
  it("takes the shapes a customer would actually paste", () => {
    expect(isPixKey("joao@bookland.com")).toBe(true);
    expect(isPixKey("529.982.247-25")).toBe(true); // CPF with punctuation
    expect(isPixKey("11987654321")).toBe(true); // phone
    expect(isPixKey("f8bbf26e-28bb-46e0-a0a2-4aba8e674026")).toBe(true); // random key
  });

  it("rejects a half-typed key", () => {
    expect(isPixKey("1198765")).toBe(false);
    expect(isPixKey("joao@")).toBe(false);
    expect(isPixKey("")).toBe(false);
  });
});

describe("checkoutSchema", () => {
  it("accepts a fully filled card", () => {
    expect(checkoutSchema.safeParse(CARD).success).toBe(true);
  });

  it("requires every card field — none of them is optional", () => {
    expect(errorFor({ ...CARD, cardNumber: "" }, "cardNumber")).toBe(
      "Informe os 16 dígitos do cartão.",
    );
    expect(errorFor({ ...CARD, cardExpiry: "" }, "cardExpiry")).toBeDefined();
    expect(errorFor({ ...CARD, cardCvv: "" }, "cardCvv")).toBeDefined();
    expect(errorFor({ ...CARD, cardHolder: "" }, "cardHolder")).toBeDefined();
  });

  it("tells a short number apart from an implausible one", () => {
    // Different mistakes deserve different sentences: one is unfinished typing,
    // the other is a number that will never be a card.
    expect(errorFor({ ...CARD, cardNumber: "4111 11" }, "cardNumber")).toBe(
      "Informe os 16 dígitos do cartão.",
    );
    expect(errorFor({ ...CARD, cardNumber: "1234 5678 1234 5678" }, "cardNumber")).toBe(
      "Número de cartão inválido.",
    );
  });

  it("accepts a single name as holder only when there are two", () => {
    expect(errorFor({ ...CARD, cardHolder: "João" }, "cardHolder")).toBeDefined();
    expect(checkoutSchema.safeParse({ ...CARD, cardHolder: "Ana Paula Souza" }).success).toBe(true);
  });

  it("ignores card fields entirely when the method is PIX", () => {
    // Otherwise switching method would leave the form unsubmittable because of
    // errors on fields nobody can see.
    const pix = { ...CARD, paymentMethod: "PIX" as const, cardNumber: "", cardExpiry: "" };

    expect(checkoutSchema.safeParse({ ...pix, pixKey: "joao@bookland.com" }).success).toBe(true);
    expect(errorFor({ ...pix, pixKey: "" }, "pixKey")).toBe("Informe uma chave PIX válida.");
  });

  it("asks PayPal for an e-mail and nothing else", () => {
    const paypal = { ...CARD, paymentMethod: "PAYPAL" as const, cardNumber: "" };

    expect(checkoutSchema.safeParse({ ...paypal, paypalEmail: "joao@bookland.com" }).success).toBe(
      true,
    );
    expect(errorFor({ ...paypal, paypalEmail: "joao" }, "paypalEmail")).toBeDefined();
  });

  it("refuses a payment method outside the enum", () => {
    expect(checkoutSchema.safeParse({ ...CARD, paymentMethod: "BITCOIN" }).success).toBe(false);
  });
});
