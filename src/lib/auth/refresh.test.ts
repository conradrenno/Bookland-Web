import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { isApiError } from "@/lib/api/errors";
import { server } from "@/test/msw";
import { renewTokens, resetRenewalState } from "./refresh";

const BASE = "http://localhost:8080";
const REFRESH_URL = `${BASE}/api/v1/auth/refresh`;

afterEach(() => resetRenewalState());

function tokenPair(refreshToken: string) {
  return {
    accessToken: `access-for-${refreshToken}`,
    tokenType: "Bearer",
    accessTokenExpiresAt: "2026-07-29T18:48:33Z",
    refreshToken,
    refreshTokenExpiresAt: "2026-08-03T18:48:33Z",
  };
}

/** Stubs the endpoint and counts how many times it was actually hit. */
function stubRefresh(options: { delayMs?: number } = {}) {
  const calls: string[] = [];
  server.use(
    http.post(REFRESH_URL, async ({ request }) => {
      const body = (await request.json()) as { refreshToken: string };
      calls.push(body.refreshToken);
      if (options.delayMs) await delay(options.delayMs);
      return HttpResponse.json(tokenPair(`rotated-${calls.length}`));
    }),
  );
  return calls;
}

describe("renewTokens", () => {
  it("returns the rotated pair", async () => {
    stubRefresh();

    const tokens = await renewTokens("original-refresh");

    expect(tokens.refreshToken).toBe("rotated-1");
    expect(tokens.accessToken).toBe("access-for-rotated-1");
  });

  it("collapses concurrent callers into a single upstream renewal", async () => {
    // The heart of the design: the upstream rotates, so a second parallel
    // renewal would present an already-consumed token and kill the session.
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

  it("renews again once the previous attempt settled", async () => {
    // Serialising must not mean caching: a later, genuinely separate expiry
    // still deserves its own renewal.
    const calls = stubRefresh();

    await renewTokens("original-refresh");
    await renewTokens("rotated-1");

    expect(calls).toEqual(["original-refresh", "rotated-1"]);
  });

  it("surfaces a dead refresh token as INVALID_REFRESH_TOKEN", async () => {
    server.use(
      http.post(REFRESH_URL, () =>
        HttpResponse.json(
          { title: "Unauthorized", status: 401, code: "INVALID_REFRESH_TOKEN" },
          { status: 401, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const error = await renewTokens("already-rotated").catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.INVALID_REFRESH_TOKEN);
  });

  it("does not pin later callers to a failed attempt", async () => {
    // If the in-flight promise survived a rejection, every future renewal in
    // this process would replay the same failure and the app would never recover.
    let attempt = 0;
    server.use(
      http.post(REFRESH_URL, () => {
        attempt += 1;
        return attempt === 1
          ? HttpResponse.json(
              { title: "Bad Gateway", status: 502, code: "INTERNAL_ERROR" },
              { status: 502, headers: { "Content-Type": "application/problem+json" } },
            )
          : HttpResponse.json(tokenPair("rotated-after-recovery"));
      }),
    );

    await expect(renewTokens("original-refresh")).rejects.toBeDefined();
    await expect(renewTokens("original-refresh")).resolves.toMatchObject({
      refreshToken: "rotated-after-recovery",
    });
  });

  it("shares the same rejection with everyone waiting on that attempt", async () => {
    server.use(
      http.post(REFRESH_URL, async () => {
        await delay(20);
        return HttpResponse.json(
          { title: "Unauthorized", status: 401, code: "INVALID_REFRESH_TOKEN" },
          { status: 401, headers: { "Content-Type": "application/problem+json" } },
        );
      }),
    );

    const results = await Promise.allSettled([
      renewTokens("dead-token"),
      renewTokens("dead-token"),
    ]);

    expect(results.every((r) => r.status === "rejected")).toBe(true);
  });
});
