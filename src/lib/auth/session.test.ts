import { describe, expect, it } from "vitest";

import {
  decodeAccessToken,
  EXPIRY_SKEW_MS,
  isTokenExpired,
  toSessionUser,
  type AccessTokenClaims,
} from "./session";

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Builds an unsigned JWT shaped like the ones Bookland issues (HS384). */
function tokenWith(claims: Record<string, unknown>): string {
  return [base64Url(JSON.stringify({ alg: "HS384" })), base64Url(JSON.stringify(claims)), "sig"].join(
    ".",
  );
}

const VALID_CLAIMS: AccessTokenClaims = {
  sub: "16582a57-2fdd-42d9-950c-70dc54e8c100",
  email: "customer@example.com",
  role: "CUSTOMER",
  iat: 1_785_178_113,
  exp: 1_785_264_513,
};

describe("decodeAccessToken", () => {
  it("reads the claims a real Bookland token carries", () => {
    expect(decodeAccessToken(tokenWith({ ...VALID_CLAIMS }))).toEqual(VALID_CLAIMS);
  });

  it("keeps the user id under `sub`, not `userId`", () => {
    // The stories say "userId"; the contract says `sub`. Getting this wrong
    // silently produces an undefined id.
    const claims = decodeAccessToken(tokenWith({ ...VALID_CLAIMS }));
    expect(claims?.sub).toBe(VALID_CLAIMS.sub);
  });

  it("decodes non-ASCII claims as UTF-8", () => {
    const claims = decodeAccessToken(tokenWith({ ...VALID_CLAIMS, email: "joão@example.com" }));
    expect(claims?.email).toBe("joão@example.com");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["not a JWT", "garbage"],
    ["wrong segment count", "a.b"],
    ["payload that is not JSON", ["aGVhZGVy", "bm90LWpzb24", "sig"].join(".")],
  ])("returns null for %s instead of throwing", (_label, token) => {
    // A corrupt cookie must degrade to "signed out" — throwing here would crash
    // a render for every page that reads identity.
    expect(decodeAccessToken(token as string | null | undefined)).toBeNull();
  });

  it("rejects a payload missing the fields we depend on", () => {
    expect(decodeAccessToken(tokenWith({ email: "x@y.com" }))).toBeNull();
  });

  it("rejects an unknown role rather than trusting it", () => {
    expect(decodeAccessToken(tokenWith({ ...VALID_CLAIMS, role: "SUPERUSER" }))).toBeNull();
  });
});

describe("isTokenExpired", () => {
  const expMs = VALID_CLAIMS.exp * 1000;

  it("treats a comfortably valid token as live", () => {
    expect(isTokenExpired(VALID_CLAIMS, expMs - 60 * 60 * 1000)).toBe(false);
  });

  it("treats a past token as expired", () => {
    expect(isTokenExpired(VALID_CLAIMS, expMs + 1)).toBe(true);
  });

  it("expires early by the skew, so a call never races the deadline", () => {
    // Just inside the skew window: still technically valid, but too close to
    // survive a round trip — renew now.
    expect(isTokenExpired(VALID_CLAIMS, expMs - EXPIRY_SKEW_MS + 1)).toBe(true);
    expect(isTokenExpired(VALID_CLAIMS, expMs - EXPIRY_SKEW_MS - 1)).toBe(false);
  });

  it("treats absent claims as expired", () => {
    expect(isTokenExpired(null)).toBe(true);
  });
});

describe("toSessionUser", () => {
  it("projects claims into the identity the UI consumes", () => {
    expect(toSessionUser(VALID_CLAIMS)).toEqual({
      id: VALID_CLAIMS.sub,
      email: VALID_CLAIMS.email,
      role: "CUSTOMER",
      isAdmin: false,
    });
  });

  it("flags an admin", () => {
    expect(toSessionUser({ ...VALID_CLAIMS, role: "ADMIN" })?.isAdmin).toBe(true);
  });

  it("maps absent claims to no user", () => {
    expect(toSessionUser(null)).toBeNull();
  });
});
