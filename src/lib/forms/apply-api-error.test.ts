import { describe, expect, it, vi } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { GENERIC_ERROR_MESSAGE } from "@/lib/api/error-messages";
import { applyApiError, toErrorBody } from "./apply-api-error";

const FIELDS = ["name", "email", "password"] as const;

function apply(body: unknown) {
  const setFieldError = vi.fn();
  const banner = applyApiError(toErrorBody(body), { fields: FIELDS, setFieldError });
  return { banner, setFieldError };
}

describe("applyApiError", () => {
  it("puts a business error in the banner without blaming a field", () => {
    const { banner, setFieldError } = apply({
      code: ErrorCodes.CHECKOUT_IN_PROGRESS,
      message: "A checkout is already running",
    });

    expect(banner).toBe(
      "Você já tem um pedido sendo processado. Aguarde a confirmação antes de fazer outro.",
    );
    expect(setFieldError).not.toHaveBeenCalled();
  });

  it("puts a duplicate e-mail on the e-mail field and shows no banner", () => {
    const { banner, setFieldError } = apply({
      code: ErrorCodes.EMAIL_ALREADY_EXISTS,
      message: "E-mail already registered",
    });

    expect(setFieldError).toHaveBeenCalledWith("email", "Este e-mail já está cadastrado.");
    expect(banner).toBeNull();
  });

  it("spreads fieldErrors over the matching fields", () => {
    const { banner, setFieldError } = apply({
      code: ErrorCodes.VALIDATION_ERROR,
      message: "Validation failed",
      fieldErrors: { password: ["size must be between 8 and 72"], name: ["must not be blank"] },
    });

    expect(setFieldError).toHaveBeenCalledWith("password", "size must be between 8 and 72");
    expect(setFieldError).toHaveBeenCalledWith("name", "must not be blank");
    expect(banner).toBeNull();
  });

  it("joins several messages for the same field", () => {
    const { setFieldError } = apply({
      code: ErrorCodes.VALIDATION_ERROR,
      message: "Validation failed",
      fieldErrors: { password: ["too short", "needs a digit"] },
    });

    expect(setFieldError).toHaveBeenCalledWith("password", "too short needs a digit");
  });

  it("moves a message for an unrendered field to the banner instead of dropping it", () => {
    // Swallowing it would leave the user with a form that failed invisibly.
    const { banner, setFieldError } = apply({
      code: ErrorCodes.VALIDATION_ERROR,
      message: "Validation failed",
      fieldErrors: { phone: ["must not be blank"] },
    });

    expect(setFieldError).not.toHaveBeenCalled();
    expect(banner).toBe("must not be blank");
  });

  it("sends payload-level errors to the banner", () => {
    const { banner } = apply({
      code: ErrorCodes.VALIDATION_ERROR,
      message: "Validation failed",
      fieldErrors: { _: ["payload is invalid"] },
    });

    expect(banner).toBe("payload is invalid");
  });

  it("falls back to generic copy for a code it has never seen", () => {
    // A code we do not know also has copy we have not reviewed — do not echo it.
    const { banner } = apply({ code: "SOMETHING_NEW", message: "Upstream prose" });

    expect(banner).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("survives a body that is not our envelope", () => {
    expect(apply("<html>502 Bad Gateway</html>").banner).toBe(GENERIC_ERROR_MESSAGE);
    expect(apply(null).banner).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe("toErrorBody", () => {
  it("accepts a body carrying a code", () => {
    expect(toErrorBody({ code: "X", message: "m" })).toEqual({ code: "X", message: "m" });
  });

  it("rejects anything without one", () => {
    expect(toErrorBody({ message: "m" })).toBeNull();
    expect(toErrorBody("boom")).toBeNull();
  });
});
