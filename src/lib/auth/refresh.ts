/**
 * Token renewal, serialised so concurrent callers never race.
 *
 * Why serialising matters here specifically: the upstream **rotates** the
 * refresh token — renewing invalidates the one you sent. Two calls renewing in
 * parallel means the second presents a token the first already consumed, gets
 * `INVALID_REFRESH_TOKEN`, and drops a session whose user did nothing wrong.
 *
 * The fix is a single in-flight promise: the first caller performs the renewal,
 * everyone else awaits that same result.
 *
 * ⚠️ **Scope of the guarantee: one process.** Next may run middleware (Edge) and
 * route handlers (Node) in separate runtimes, and a multi-instance deployment
 * multiplies that. This removes the common in-process race, not a distributed
 * one — which would need a shared lock. Acceptable for a single-node BFF;
 * revisit if we ever scale out (docs/specs/02-auth.md).
 */

import type { TokenViewModel } from "@/lib/api/types";
import { refresh as refreshUpstream } from "@/lib/api/auth";

/** The renewal currently in flight, if any. Module-scoped on purpose. */
let inFlight: Promise<TokenViewModel> | null = null;

/**
 * Renews the pair, collapsing concurrent attempts into one upstream call.
 *
 * Throws `ApiError` when renewal fails — typically 401 `INVALID_REFRESH_TOKEN`,
 * which the caller should treat as "session over" and clear the cookies.
 *
 * Note it does **not** touch cookies itself: writing them is only legal in some
 * Next contexts, so persisting the result is the caller's job.
 */
export function renewTokens(refreshToken: string): Promise<TokenViewModel> {
  // A renewal already running was started with the same cookie value we would
  // send, so its result is exactly what this caller needs.
  if (inFlight) return inFlight;

  inFlight = refreshUpstream({ refreshToken }).finally(() => {
    // Cleared on success *and* failure: a failed attempt must not pin every
    // later caller to the same rejection for the rest of the process's life.
    inFlight = null;
  });

  return inFlight;
}

/** Test seam: drops any in-flight renewal so suites do not leak state. */
export function resetRenewalState(): void {
  inFlight = null;
}
