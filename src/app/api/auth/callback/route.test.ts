import { http, HttpResponse } from "msw";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodePendingLogin } from "@/lib/auth/cookies";
import { server } from "@/test/msw";
import { GET } from "./route";

const BFF = "http://127.0.0.1:3000";
const TOKEN_URL = "http://127.0.0.1:9000/oauth2/token";
const PENDING = { state: "the-state", verifier: "the-verifier", next: "/checkout" };

const TOKENS = {
  access_token: "access",
  refresh_token: "refresh",
  id_token: "id",
  token_type: "Bearer",
  expires_in: 899,
  scope: "openid profile email",
};

function callback(query: string, pending: typeof PENDING | null = PENDING) {
  const headers: Record<string, string> = {};
  if (pending) headers.cookie = `bl_oauth=${encodePendingLogin(pending)}`;
  return GET(new NextRequest(`${BFF}/api/auth/callback${query}`, { headers }));
}

/** The pending-login cookie must be spent on every outcome. */
function expectPendingCleared(response: Response) {
  const cleared = response.headers.getSetCookie().find((c) => c.startsWith("bl_oauth="));
  expect(cleared).toMatch(/Path=\/api\/auth\/callback/);
  expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
}

describe("GET /api/auth/callback", () => {
  // Failed exchanges are logged on purpose; the noise is not the test's subject.
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("exchanges the code, stores the tokens and goes on to the destination", async () => {
    let form: URLSearchParams | undefined;
    server.use(
      http.post(TOKEN_URL, async ({ request }) => {
        form = new URLSearchParams(await request.text());
        return HttpResponse.json(TOKENS);
      }),
    );

    const response = await callback("?code=the-code&state=the-state");

    expect(form?.get("code")).toBe("the-code");
    expect(form?.get("code_verifier")).toBe("the-verifier");
    expect(response.headers.get("location")).toBe(`${BFF}/checkout`);
    expect(response.cookies.get("bl_access")?.value).toBe("access");
    expect(response.cookies.get("bl_refresh")?.value).toBe("refresh");
    expect(response.cookies.get("bl_id")?.value).toBe("id");
    expectPendingCleared(response);
  });

  it("refuses a state this browser did not create — login CSRF", async () => {
    // No stub: the code must never be exchanged. MSW fails the test on any call.
    const response = await callback("?code=c&state=someone-elses");

    expect(response.headers.get("location")).toBe(`${BFF}/login?next=%2Fcheckout&error=expired`);
    expect(response.cookies.get("bl_access")).toBeUndefined();
    expectPendingCleared(response);
  });

  it("refuses a callback with no login in flight", async () => {
    const response = await callback("?code=c&state=the-state", null);

    expect(response.headers.get("location")).toBe(`${BFF}/login?error=expired`);
  });

  it("reports a declined login", async () => {
    const response = await callback("?error=access_denied&state=the-state");

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("denied");
  });

  it("reports a refused code as a failed login", async () => {
    server.use(
      http.post(TOKEN_URL, () => HttpResponse.json({ error: "invalid_grant" }, { status: 400 })),
    );

    const response = await callback("?code=spent&state=the-state");

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe("failed");
    expect(response.cookies.get("bl_access")).toBeUndefined();
  });

  it("reports an unreachable identity service as such", async () => {
    server.use(http.post(TOKEN_URL, () => HttpResponse.error()));

    const response = await callback("?code=c&state=the-state");

    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toBe(
      "unavailable",
    );
  });
});
