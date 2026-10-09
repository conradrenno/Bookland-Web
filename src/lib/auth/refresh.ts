/**
 * Token renewal, made safe for a refresh token that only works once.
 *
 * The Authorization Server **rotates** the refresh token: renewing invalidates
 * the one sent. With access tokens living 15 minutes, a page whose access token
 * just expired fires several requests at once — the document, prefetches, BFF
 * calls — all carrying the same refresh cookie. Renewing for each would spend
 * that token on the first and hand every other request `invalid_grant`, logging
 * out a user who did nothing wrong (docs/specs/21, R5).
 *
 * Two layers stop that:
 *
 * 1. **In flight** — concurrent callers with the same token share one upstream
 *    call.
 * 2. **Recently renewed** — for a short while after it settles, a caller still
 *    presenting the token just spent gets the same result. That is the request
 *    the browser sent *before* the `Set-Cookie` with the new token reached it.
 *
 * ⚠️ **Scope of the guarantee: one process.** Fine for a single-node BFF; a
 * multi-instance deployment would need the memo in a shared store.
 */

import type { OAuthTokenResponse } from "@/lib/api/types";
import { refreshTokens } from "./oauth";

/**
 * How long a spent refresh token keeps answering with its successor.
 *
 * Long enough to cover a page's burst of requests and a slow network; short
 * enough that a stolen, already-rotated token is useless soon after. Beyond it
 * the token is just as dead upstream as it always was.
 */
export const RECENT_RENEWAL_TTL_MS = 30_000;

interface Renewal {
  result: Promise<OAuthTokenResponse>;
  /** Set once the renewal succeeds; until then the entry counts as in flight. */
  settledAt?: number;
}

/** Keyed by the refresh token that was spent. Module-scoped on purpose. */
const renewals = new Map<string, Renewal>();

function forgetStale(now: number): void {
  for (const [token, renewal] of renewals) {
    if (renewal.settledAt !== undefined && now - renewal.settledAt > RECENT_RENEWAL_TTL_MS) {
      renewals.delete(token);
    }
  }
}

/**
 * Renews the session, collapsing every caller holding the same refresh token
 * into one upstream call.
 *
 * Throws `ApiError` when renewal fails — `SESSION_ENDED` for a refused token,
 * which the caller should treat as "log in again" and clear the cookies. A
 * failure is never remembered: the next caller gets a fresh attempt.
 *
 * It does **not** touch cookies: writing them is only legal in some Next
 * contexts, so persisting the result is the caller's job.
 */
export function renewTokens(
  refreshToken: string,
  now: () => number = Date.now,
): Promise<OAuthTokenResponse> {
  forgetStale(now());

  const existing = renewals.get(refreshToken);
  if (existing) return existing.result;

  const renewal: Renewal = {
    result: refreshTokens(refreshToken).then(
      (tokens) => {
        renewal.settledAt = now();
        return tokens;
      },
      (error: unknown) => {
        renewals.delete(refreshToken);
        throw error;
      },
    ),
  };
  renewals.set(refreshToken, renewal);
  return renewal.result;
}

/** Test seam: drops every remembered renewal so suites do not leak state. */
export function resetRenewalState(): void {
  renewals.clear();
}
