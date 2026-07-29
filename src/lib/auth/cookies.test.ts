import { describe, expect, it } from "vitest";

import { cookieOptionsFor } from "./cookies";

const NOW = Date.parse("2026-07-28T12:00:00Z");

describe("cookieOptionsFor", () => {
  it("derives Max-Age from the token's own expiry", () => {
    const oneHourLater = new Date(NOW + 60 * 60 * 1000).toISOString();

    expect(cookieOptionsFor(oneHourLater, NOW).maxAge).toBe(3600);
  });

  it("clamps an already-expired token to zero", () => {
    // A negative Max-Age reads as "delete this cookie" to the browser, which
    // would silently sign the user out on a clock skew.
    const past = new Date(NOW - 60 * 1000).toISOString();

    expect(cookieOptionsFor(past, NOW).maxAge).toBe(0);
  });

  it("marks the cookie httpOnly and path-wide so the browser cannot read it", () => {
    const options = cookieOptionsFor(new Date(NOW + 1000).toISOString(), NOW);

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("matches the 7-day refresh window the API issues", () => {
    const sevenDays = new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString();

    expect(cookieOptionsFor(sevenDays, NOW).maxAge).toBe(604_800);
  });
});
