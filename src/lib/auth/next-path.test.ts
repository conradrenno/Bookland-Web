import { describe, expect, it } from "vitest";

import { loginHref, resolveAfterAuthPath, safeNextPath, withNextParam } from "./next-path";

describe("safeNextPath", () => {
  it("keeps a same-site path, query and hash included", () => {
    expect(safeNextPath("/cart")).toBe("/cart");
    expect(safeNextPath("/orders?page=2")).toBe("/orders?page=2");
    expect(safeNextPath("/livros/1#reviews")).toBe("/livros/1#reviews");
  });

  it("rejects an absolute URL to another origin", () => {
    expect(safeNextPath("https://evil.tld")).toBeNull();
    expect(safeNextPath("http://evil.tld/cart")).toBeNull();
  });

  it("rejects protocol-relative forms the browser resolves off-site", () => {
    // `//evil.tld` inherits the current scheme — it is not a path.
    expect(safeNextPath("//evil.tld")).toBeNull();
    // Backslash: browsers normalise `/\` to `//`.
    expect(safeNextPath("/\\evil.tld")).toBeNull();
  });

  it("rejects control characters, which browsers strip before parsing", () => {
    // Would collapse to `//evil.tld` once the tab is removed.
    expect(safeNextPath("/\t/evil.tld")).toBeNull();
    expect(safeNextPath("/\n//evil.tld")).toBeNull();
  });

  it("rejects a relative path, which could resolve anywhere", () => {
    expect(safeNextPath("cart")).toBeNull();
    expect(safeNextPath("../admin")).toBeNull();
  });

  it("treats missing and empty values as no destination", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath("")).toBeNull();
  });
});

describe("resolveAfterAuthPath", () => {
  it("falls back to the home page when the value is unusable", () => {
    expect(resolveAfterAuthPath("//evil.tld")).toBe("/");
    expect(resolveAfterAuthPath(null)).toBe("/");
  });

  it("passes a trusted path through", () => {
    expect(resolveAfterAuthPath("/checkout")).toBe("/checkout");
  });

  it("refuses a repeated parameter instead of picking one of the values", () => {
    // `?next=/cart&next=//evil.tld` arrives as an array; reading only the first
    // entry is how a second value sneaks past the check.
    expect(resolveAfterAuthPath(["/cart", "//evil.tld"])).toBe("/");
  });
});

describe("withNextParam", () => {
  it("carries the pending destination to the other auth page", () => {
    expect(withNextParam("/register", "/cart")).toBe("/register?next=%2Fcart");
  });

  it("encodes a destination that already has a query", () => {
    expect(withNextParam("/login", "/orders?page=2")).toBe("/login?next=%2Forders%3Fpage%3D2");
  });

  it("leaves the link clean when the destination is just the home page", () => {
    expect(withNextParam("/register", "/")).toBe("/register");
  });
});

describe("loginHref", () => {
  it("starts the OAuth2 login, carrying the destination", () => {
    expect(loginHref("/cart")).toBe("/api/auth/login?next=%2Fcart");
  });

  it("leaves the link clean for the home page", () => {
    expect(loginHref()).toBe("/api/auth/login");
  });
});
