import { NextResponse, type NextRequest } from "next/server";

import { BFF_BASE_URL, COOKIE } from "@/lib/config";
import { SESSION_COOKIES } from "@/lib/auth/cookies";
import { buildEndSessionUrl, revokeRefreshToken } from "@/lib/auth/oauth";

/**
 * US-04 — ends the session, here and at the identity service (docs/specs/21).
 *
 * Reached by a **form submission**, not `fetch`: the answer redirects to the
 * identity service — another origin — so that it can end its own login
 * session too. Otherwise the next "Entrar" would sign the user straight back
 * in without asking for the password. A `fetch` cannot follow that redirect.
 *
 * 303, so the browser follows with a GET whatever the method was.
 *
 * The local cookies are cleared **no matter what**: refusing to sign out
 * because the identity service is down would trap the user in a session they
 * explicitly asked to leave.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(COOKIE.refresh)?.value;
  const idToken = request.cookies.get(COOKIE.id)?.value;

  if (refreshToken) {
    try {
      // Ending the identity session does not invalidate a refresh token the BFF
      // already holds, so it is revoked explicitly (docs/specs/21, R4).
      await revokeRefreshToken(refreshToken);
    } catch (error) {
      // Worth knowing about — the token stays valid until it expires — but
      // never worth failing the sign-out over.
      console.warn("[auth] refresh token revocation failed; signing out anyway", error);
    }
  }

  // Without an id_token there is no session to name at the identity service;
  // going home is all that is left.
  const destination = idToken ? buildEndSessionUrl(idToken) : `${BFF_BASE_URL}/`;
  const response = NextResponse.redirect(destination, 303);
  for (const name of SESSION_COOKIES) response.cookies.delete(name);
  return response;
}
