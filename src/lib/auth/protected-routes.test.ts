import { describe, expect, it } from "vitest";

import { isProtectedPath, PROTECTED_PREFIXES } from "./protected-routes";

describe("isProtectedPath", () => {
  it.each(PROTECTED_PREFIXES)("protects %s itself", (prefix) => {
    expect(isProtectedPath(prefix)).toBe(true);
  });

  it.each([
    "/cart/items",
    "/orders/bd99d2c2-b832-4f76-bf13-7a7aaa66c4b4",
    "/checkout/confirm",
    "/account/settings",
  ])("protects nested route %s", (pathname) => {
    expect(isProtectedPath(pathname)).toBe(true);
  });

  it.each(["/", "/books", "/books/123", "/categories", "/login", "/register"])(
    "leaves %s public",
    (pathname) => {
      expect(isProtectedPath(pathname)).toBe(false);
    },
  );

  it.each(["/cartografia", "/orders-history", "/accounts", "/checkouts"])(
    "does not let %s match on a partial prefix",
    (pathname) => {
      // A naive startsWith would lock these public pages behind a login.
      expect(isProtectedPath(pathname)).toBe(false);
    },
  );
});
