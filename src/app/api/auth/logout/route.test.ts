import { http, HttpResponse } from "msw";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/msw";
import { POST } from "./route";

const BFF = "http://127.0.0.1:3000";
const REVOKE_URL = "http://127.0.0.1:9000/oauth2/revoke";

function logout(cookies: Record<string, string>) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return POST(new NextRequest(`${BFF}/api/auth/logout`, { method: "POST", headers: { cookie } }));
}

function expectSessionCleared(response: Response) {
  const cleared = response.headers.getSetCookie().map((c) => c.split("=")[0]);
  expect(cleared).toEqual(expect.arrayContaining(["bl_access", "bl_refresh", "bl_id"]));
}

describe("POST /api/auth/logout", () => {
  it("revokes the refresh token and ends the identity session too", async () => {
    let revoked: string | null = null;
    server.use(
      http.post(REVOKE_URL, async ({ request }) => {
        revoked = new URLSearchParams(await request.text()).get("token");
        return new HttpResponse(null, { status: 200 });
      }),
    );

    const response = await logout({ bl_access: "a", bl_refresh: "r", bl_id: "the.id.token" });

    expect(revoked).toBe("r");
    // 303: the browser follows with a GET, whatever the method was.
    expect(response.status).toBe(303);
    const target = new URL(response.headers.get("location")!);
    expect(target.origin + target.pathname).toBe("http://127.0.0.1:9000/connect/logout");
    expect(target.searchParams.get("id_token_hint")).toBe("the.id.token");
    expectSessionCleared(response);
  });

  it("goes home when there is no id_token to name the session", async () => {
    server.use(http.post(REVOKE_URL, () => new HttpResponse(null, { status: 200 })));

    const response = await logout({ bl_refresh: "r" });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${BFF}/`);
    expectSessionCleared(response);
  });

  it("signs out even when the revocation fails", async () => {
    // Refusing would trap the user in a session they asked to leave.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(http.post(REVOKE_URL, () => HttpResponse.error()));

    const response = await logout({ bl_refresh: "r", bl_id: "the.id.token" });

    expect(response.status).toBe(303);
    expectSessionCleared(response);
  });

  it("does not call the identity service with nothing to revoke", async () => {
    // No stub: MSW fails the test on any unexpected call.
    const response = await logout({});

    expect(response.headers.get("location")).toBe(`${BFF}/`);
  });
});
