import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { isApiError } from "@/lib/api/errors";
import { server } from "@/test/msw";
import { RECENT_RENEWAL_TTL_MS, renewTokens, resetRenewalState } from "./refresh";

const TOKEN_URL = "http://127.0.0.1:9000/oauth2/token";

afterEach(() => resetRenewalState());

function tokenSet(refreshToken: string) {
  return {
    access_token: `access-for-${refreshToken}`,
    refresh_token: refreshToken,
    id_token: `id-for-${refreshToken}`,
    token_type: "Bearer",
    expires_in: 899,
    scope: "openid profile email",
  };
}

/** Stubs the token endpoint and records which refresh tokens were spent. */
function stubRefresh(options: { delayMs?: number } = {}) {
  const calls: string[] = [];
  server.use(
    http.post(TOKEN_URL, async ({ request }) => {
      const form = new URLSearchParams(await request.text());
      calls.push(form.get("refresh_token") ?? "");
      if (options.delayMs) await delay(options.delayMs);
      return HttpResponse.json(tokenSet(`rotated-${calls.length}`));
    }),
  );
  return calls;
}

function stubInvalidGrant(delayMs = 0) {
  server.use(
    http.post(TOKEN_URL, async () => {
      if (delayMs) await delay(delayMs);
      return HttpResponse.json({ error: "invalid_grant" }, { status: 400 });
    }),
  );
}

describe("renewTokens", () => {
  it("returns the rotated set", async () => {
    stubRefresh();

    const tokens = await renewTokens("original-refresh");

    expect(tokens.refresh_token).toBe("rotated-1");
    expect(tokens.access_token).toBe("access-for-rotated-1");
  });

  it("collapses concurrent callers into a single upstream renewal", async () => {
    // The heart of the design: the refresh token is single use, so a second
    // parallel renewal would present a spent token and kill the session.
    const calls = stubRefresh({ delayMs: 20 });

    const [first, second, third] = await Promise.all([
      renewTokens("original-refresh"),
      renewTokens("original-refresh"),
      renewTokens("original-refresh"),
    ]);

    expect(calls).toHaveLength(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("answers a late caller still holding the spent token with the same set", async () => {
    // The request the browser sent before the Set-Cookie with the new token
    // arrived. Upstream, that token is already dead.
    const calls = stubRefresh();
    let now = 1_000;

    const first = await renewTokens("original-refresh", () => now);
    now += RECENT_RENEWAL_TTL_MS - 1;
    const late = await renewTokens("original-refresh", () => now);

    expect(calls).toHaveLength(1);
    expect(late).toBe(first);
  });

  it("forgets a spent token once the grace period is over", async () => {
    const calls = stubRefresh();
    let now = 1_000;

    await renewTokens("original-refresh", () => now);
    now += RECENT_RENEWAL_TTL_MS + 1;
    await renewTokens("original-refresh", () => now);

    expect(calls).toEqual(["original-refresh", "original-refresh"]);
  });

  it("renews again for the next token in the chain", async () => {
    // Remembering spent tokens must not stop a genuinely later expiry from
    // getting its own renewal.
    const calls = stubRefresh();

    await renewTokens("original-refresh");
    await renewTokens("rotated-1");

    expect(calls).toEqual(["original-refresh", "rotated-1"]);
  });

  it("surfaces a refused token as SESSION_ENDED", async () => {
    stubInvalidGrant();

    const error = await renewTokens("already-rotated").catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.SESSION_ENDED);
    expect(isApiError(error) && error.status).toBe(401);
  });

  it("does not pin later callers to a failed attempt", async () => {
    // If a rejection were remembered, every later renewal in this process would
    // replay the same failure and the app would never recover.
    let attempt = 0;
    server.use(
      http.post(TOKEN_URL, () => {
        attempt += 1;
        return attempt === 1
          ? HttpResponse.json({ error: "server_error" }, { status: 500 })
          : HttpResponse.json(tokenSet("rotated-after-recovery"));
      }),
    );

    await expect(renewTokens("original-refresh")).rejects.toBeDefined();
    await expect(renewTokens("original-refresh")).resolves.toMatchObject({
      refresh_token: "rotated-after-recovery",
    });
  });

  it("shares the same rejection with everyone waiting on that attempt", async () => {
    stubInvalidGrant(20);

    const results = await Promise.allSettled([
      renewTokens("dead-token"),
      renewTokens("dead-token"),
    ]);

    expect(results.every((r) => r.status === "rejected")).toBe(true);
  });
});
