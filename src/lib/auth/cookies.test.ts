import { describe, expect, it } from "vitest";

import {
  cookieOptions,
  decodePendingLogin,
  encodePendingLogin,
  pendingLoginCookie,
  REFRESH_TOKEN_MAX_AGE,
  tokenCookies,
} from "./cookies";

const TOKENS = {
  access_token: "access",
  refresh_token: "refresh",
  id_token: "id",
  token_type: "Bearer" as const,
  expires_in: 899,
  scope: "openid profile email",
};

describe("cookieOptions", () => {
  it("marks the cookie httpOnly and path-wide so the browser cannot read it", () => {
    const options = cookieOptions(60);

    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });

  it("clamps a negative age to zero", () => {
    // A negative Max-Age reads as "delete this cookie" to the browser.
    expect(cookieOptions(-5).maxAge).toBe(0);
  });
});

describe("tokenCookies", () => {
  it("writes all three tokens, the access one dying with the token", () => {
    const writes = Object.fromEntries(tokenCookies(TOKENS).map((w) => [w.name, w]));

    expect(writes.bl_access.value).toBe("access");
    expect(writes.bl_access.options.maxAge).toBe(899);
    expect(writes.bl_refresh.value).toBe("refresh");
    expect(writes.bl_refresh.options.maxAge).toBe(REFRESH_TOKEN_MAX_AGE);
    expect(writes.bl_id.value).toBe("id");
  });

  it("matches the 7-day refresh window the server issues", () => {
    expect(REFRESH_TOKEN_MAX_AGE).toBe(604_800);
  });

  it("keeps the previous id cookie when a refresh brings no id_token", () => {
    const names = tokenCookies({ ...TOKENS, id_token: "" }).map((w) => w.name);

    expect(names).toEqual(["bl_access", "bl_refresh"]);
  });
});

describe("pending login cookie", () => {
  const pending = { state: "s-1_A", verifier: "v-2_B", next: "/orders/abc?page=2" };

  it("round-trips state, verifier and next", () => {
    expect(decodePendingLogin(encodePendingLogin(pending))).toEqual(pending);
  });

  it("survives a next that contains dots", () => {
    const withDots = { ...pending, next: "/books/a.b.c" };

    expect(decodePendingLogin(encodePendingLogin(withDots))).toEqual(withDots);
  });

  it.each([undefined, "", "only-one-part", "a.b", ".b.c", "a..c", "a.b.%E0%A4%A"])(
    "refuses a malformed value (%s)",
    (value) => {
      expect(decodePendingLogin(value)).toBeNull();
    },
  );

  it("is only sent to the callback, and only for ten minutes", () => {
    const { name, options } = pendingLoginCookie(pending);

    expect(name).toBe("bl_oauth");
    expect(options.path).toBe("/api/auth/callback");
    expect(options.maxAge).toBe(600);
    expect(options.httpOnly).toBe(true);
  });
});
