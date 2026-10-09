import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { isApiError } from "@/lib/api/errors";
import { server } from "@/test/msw";
import {
  beginLogin,
  buildAuthorizeUrl,
  buildEndSessionUrl,
  challengeFor,
  exchangeCode,
  randomToken,
  REDIRECT_URI,
  revokeRefreshToken,
} from "./oauth";

const IDENTITY = "http://127.0.0.1:9000";

/** What MSW saw, so a test can assert on the wire format. */
function captureForm(path: string, respond: () => Response) {
  const seen: { form?: URLSearchParams; authorization?: string | null } = {};
  server.use(
    http.post(`${IDENTITY}${path}`, async ({ request }) => {
      seen.form = new URLSearchParams(await request.text());
      seen.authorization = request.headers.get("Authorization");
      return respond();
    }),
  );
  return seen;
}

describe("PKCE", () => {
  it("derives the S256 challenge of RFC 7636, appendix B", async () => {
    await expect(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).resolves.toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("makes URL-safe random tokens long enough for a verifier", () => {
    const token = randomToken();

    // RFC 7636 asks for 43 to 128 characters from the unreserved set.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
  });
});

describe("buildAuthorizeUrl", () => {
  it("asks for a code with PKCE, on the registered redirect URI", () => {
    const url = new URL(buildAuthorizeUrl({ state: "st", challenge: "ch" }));

    expect(url.origin + url.pathname).toBe(`${IDENTITY}/oauth2/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "bookland-web",
      redirect_uri: "http://127.0.0.1:3000/api/auth/callback",
      scope: "openid profile email",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
  });
});

describe("beginLogin", () => {
  it("keeps the verifier to itself and sends only its challenge", async () => {
    const { pending, url } = await beginLogin("/cart");
    const params = new URL(url).searchParams;

    expect(pending.next).toBe("/cart");
    expect(params.get("state")).toBe(pending.state);
    expect(params.get("code_challenge")).toBe(await challengeFor(pending.verifier));
    expect(url).not.toContain(pending.verifier);
  });
});

describe("buildEndSessionUrl", () => {
  it("puts the hint and the way back in the query string", () => {
    const url = new URL(buildEndSessionUrl("the.id.token"));

    expect(url.origin + url.pathname).toBe(`${IDENTITY}/connect/logout`);
    expect(url.searchParams.get("id_token_hint")).toBe("the.id.token");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("http://127.0.0.1:3000/");
  });
});

describe("exchangeCode", () => {
  it("authenticates as the client and sends the code with its verifier", async () => {
    const seen = captureForm("/oauth2/token", () =>
      HttpResponse.json({ access_token: "a", refresh_token: "r", id_token: "i", expires_in: 899 }),
    );

    await exchangeCode({ code: "the-code", verifier: "the-verifier" });

    expect(seen.authorization).toBe(`Basic ${btoa("bookland-web:test-secret")}`);
    expect(Object.fromEntries(seen.form!)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: REDIRECT_URI,
      code_verifier: "the-verifier",
    });
  });

  it("reads a refused code as the user's session ending", async () => {
    captureForm("/oauth2/token", () =>
      HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
    );

    const error = await exchangeCode({ code: "spent", verifier: "v" }).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.SESSION_ENDED);
  });

  it("reads a refused client as our misconfiguration, not the user's fault", async () => {
    captureForm("/oauth2/token", () =>
      HttpResponse.json({ error: "invalid_client" }, { status: 401 }),
    );

    const error = await exchangeCode({ code: "c", verifier: "v" }).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.OAUTH_REJECTED);
    expect(isApiError(error) && error.status).toBe(500);
  });

  it("reports an unreachable identity service as a network error", async () => {
    server.use(http.post(`${IDENTITY}/oauth2/token`, () => HttpResponse.error()));

    const error = await exchangeCode({ code: "c", verifier: "v" }).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.NETWORK_ERROR);
  });
});

describe("revokeRefreshToken", () => {
  it("revokes with the refresh token hint", async () => {
    const seen = captureForm("/oauth2/revoke", () => new HttpResponse(null, { status: 200 }));

    await revokeRefreshToken("r1");

    expect(Object.fromEntries(seen.form!)).toEqual({
      token: "r1",
      token_type_hint: "refresh_token",
    });
  });
});
