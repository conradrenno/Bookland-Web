import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { challengeFor } from "@/lib/auth/oauth";
import { decodePendingLogin } from "@/lib/auth/cookies";
import { GET } from "./route";

const BFF = "http://127.0.0.1:3000";

function login(query = "", init: { host?: string; cookie?: string } = {}) {
  const host = init.host ?? "127.0.0.1:3000";
  const headers: Record<string, string> = { host };
  if (init.cookie) headers.cookie = init.cookie;
  return GET(new NextRequest(`http://${host}/api/auth/login${query}`, { headers }));
}

/** An unsigned token that is still valid — enough for the claims check. */
function liveAccessToken(): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  const exp = Math.floor(Date.now() / 1000) + 600;
  return `${encode({ alg: "RS256" })}.${encode({ sub: "u1", email: "a@b.c", role: "CUSTOMER", exp })}.sig`;
}

describe("GET /api/auth/login", () => {
  it("sends the browser to the authorization endpoint with PKCE", async () => {
    const response = await login("?next=%2Fcart");

    expect(response.status).toBe(307);
    const target = new URL(response.headers.get("location")!);
    expect(target.origin + target.pathname).toBe("http://127.0.0.1:9000/oauth2/authorize");
    expect(target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(target.searchParams.get("redirect_uri")).toBe(`${BFF}/api/auth/callback`);
  });

  it("remembers state, verifier and destination in a cookie scoped to the callback", async () => {
    const response = await login("?next=%2Fcart");
    const target = new URL(response.headers.get("location")!);

    const pending = decodePendingLogin(response.cookies.get("bl_oauth")?.value);
    expect(pending?.next).toBe("/cart");
    expect(pending?.state).toBe(target.searchParams.get("state"));
    expect(target.searchParams.get("code_challenge")).toBe(
      await challengeFor(pending!.verifier),
    );

    const setCookie = response.headers.getSetCookie().find((c) => c.startsWith("bl_oauth="));
    expect(setCookie).toMatch(/Path=\/api\/auth\/callback/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it("refuses an off-site destination, falling back to the home page", async () => {
    const response = await login("?next=%2F%2Fevil.example");

    expect(decodePendingLogin(response.cookies.get("bl_oauth")?.value)?.next).toBe("/");
  });

  it("refuses a repeated next instead of picking one", async () => {
    const response = await login("?next=%2Fcart&next=%2F%2Fevil.example");

    expect(decodePendingLogin(response.cookies.get("bl_oauth")?.value)?.next).toBe("/");
  });

  it("moves to the BFF's own host first, so the cookie reaches the callback", async () => {
    const response = await login("?next=%2Fcart", { host: "localhost:3000" });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${BFF}/api/auth/login?next=%2Fcart`);
    expect(response.cookies.get("bl_oauth")).toBeUndefined();
  });

  it("skips the flow for someone already signed in", async () => {
    const response = await login("?next=%2Forders", {
      cookie: `bl_access=${liveAccessToken()}`,
    });

    expect(response.headers.get("location")).toBe(`${BFF}/orders`);
    expect(response.cookies.get("bl_oauth")).toBeUndefined();
  });
});
