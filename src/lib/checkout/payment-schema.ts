/**
 * Validation for the checkout's payment fields.
 *
 * Every field validated here is **decorative**: the API takes `paymentMethod`
 * and nothing else. They exist because the owner wants the demo to behave like a
 * shop, and a card box that swallows anything does not
 * (docs/specs/19-checkout.md). Nothing validated here is ever sent anywhere.
 *
 * Shape note: one flat object with a `superRefine`, rather than a discriminated
 * union on the method. A union would be tidier as a type, but React Hook Form
 * registers a *single* field set — with a union, every field that belongs to
 * another variant falls off the inferred type and `register("pixKey")` stops
 * type-checking the moment the method changes.
 */

import { z } from "zod";

import { PAYMENT_METHODS } from "@/lib/api/types";

/** Only 16-digit numbers, which covers every brand the picker offers. */
const CARD_DIGITS = 16;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * The check digit that separates "sixteen digits" from "a plausible card".
 *
 * Doubles every second digit from the right, subtracting 9 when that goes past
 * 9, and requires the total to be a multiple of ten.
 */
export function passesLuhn(digits: string): boolean {
  if (digits.length === 0) return false;

  let sum = 0;
  let double = false;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return false;

    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    double = !double;
  }

  return sum % 10 === 0;
}

/** `"4111111111111111"` → `"4111 1111 1111 1111"`, as the visitor types. */
export function formatCardNumber(value: string): string {
  return (
    digitsOnly(value)
      .slice(0, CARD_DIGITS)
      .match(/.{1,4}/g)
      ?.join(" ") ?? ""
  );
}

/** `"1229"` → `"12/29"`. Keeps the slash from having to be typed. */
export function formatExpiry(value: string): string {
  const digits = digitsOnly(value).slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/**
 * Whether `MM/AA` names a month that has not passed yet.
 *
 * `now` is a parameter so the test does not have to travel in time — and so a
 * card expiring this month stays valid until the month is over, which is how
 * expiry dates actually work.
 */
export function isFutureExpiry(value: string, now: Date = new Date()): boolean {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return false;

  const month = Number(match[1]);
  if (month < 1 || month > 12) return false;

  const year = 2000 + Number(match[2]);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  return year > currentYear || (year === currentYear && month >= currentMonth);
}

/**
 * The three shapes a PIX key can take, minus the bank-defined ones we cannot
 * check: e-mail, an 11-digit CPF or phone, or a random UUID key.
 */
const PIX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIX_RANDOM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPixKey(value: string): boolean {
  const trimmed = value.trim();
  if (PIX_EMAIL.test(trimmed) || PIX_RANDOM.test(trimmed)) return true;
  // CPF and phone arrive with or without punctuation; both are 11 digits.
  return digitsOnly(trimmed).length === 11;
}

/** Two names or more, letters and spaces — as printed on a card. */
const CARD_HOLDER = /^\p{L}[\p{L}'.-]*(\s+\p{L}[\p{L}'.-]*)+$/u;

export const checkoutSchema = z
  .object({
    paymentMethod: z.enum(PAYMENT_METHODS),
    // Plain strings, never `.default("")`: a default makes zod's input type
    // optional while the output stays required, and React Hook Form needs the
    // two to match. The form's `defaultValues` supplies the empty strings.
    cardNumber: z.string(),
    cardExpiry: z.string(),
    cardCvv: z.string(),
    cardHolder: z.string(),
    pixKey: z.string(),
    paypalEmail: z.string(),
  })
  .superRefine((values, ctx) => {
    const require = (path: keyof typeof values, ok: boolean, message: string) => {
      if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
    };

    if (values.paymentMethod === "CREDIT_CARD" || values.paymentMethod === "DEBIT_CARD") {
      const digits = digitsOnly(values.cardNumber);
      require(
        "cardNumber",
        digits.length === CARD_DIGITS && passesLuhn(digits),
        digits.length === CARD_DIGITS
          ? "Número de cartão inválido."
          : "Informe os 16 dígitos do cartão.",
      );
      require("cardExpiry", isFutureExpiry(values.cardExpiry), "Validade inválida ou vencida.");
      require("cardCvv", /^\d{3,4}$/.test(values.cardCvv), "O CVV tem 3 ou 4 dígitos.");
      require("cardHolder", CARD_HOLDER.test(values.cardHolder.trim()), "Informe nome e sobrenome.");
      return;
    }

    if (values.paymentMethod === "PIX") {
      require("pixKey", isPixKey(values.pixKey), "Informe uma chave PIX válida.");
      return;
    }

    require(
      "paypalEmail",
      PIX_EMAIL.test(values.paypalEmail.trim()),
      "Informe o e-mail da conta PayPal.",
    );
  });

export type CheckoutValues = z.infer<typeof checkoutSchema>;
