/**
 * Session access for Server Components and route handlers.
 *
 * Read-only by design: a Server Component cannot write cookies, so nothing here
 * renews anything. By the time a page renders, the middleware has already made
 * sure the access token is fresh (docs/specs/02-auth.md).
 */

import { decodeAccessToken, toSessionUser, type SessionUser } from "./session";
import { readTokens } from "./cookies";

/**
 * The access token to attach to upstream calls, or `null` when signed out.
 *
 * Returned as-is without an expiry check: if it did expire, the upstream answers
 * 401 and the caller surfaces "session expired" — better than silently rendering
 * a signed-out page while the cookie says otherwise.
 */
export async function getAccessToken(): Promise<string | null> {
  const { accessToken } = await readTokens();
  return accessToken ?? null;
}

/**
 * Identity for the UI (greeting, admin affordances), or `null` when signed out.
 *
 * Derived from unverified claims — see the warning in `session.ts`. Use it to
 * decide what to *show*, never what to *allow*.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const { accessToken } = await readTokens();
  return toSessionUser(decodeAccessToken(accessToken));
}

/** Convenience for layouts that only need a boolean. */
export async function isSignedIn(): Promise<boolean> {
  return (await getAccessToken()) !== null;
}
