import { NextResponse, type NextRequest } from "next/server";

import { ErrorCodes } from "@/lib/api/error-codes";
import { isApiError } from "@/lib/api/errors";
import { COOKIE } from "@/lib/config";
import { SESSION_COOKIES, tokenCookies } from "@/lib/auth/cookies";
import { loginHref } from "@/lib/auth/next-path";
import { isProtectedPath } from "@/lib/auth/protected-routes";
import { renewTokens } from "@/lib/auth/refresh";
import { decodeAccessToken, isTokenExpired } from "@/lib/auth/session";
import type { OAuthTokenResponse } from "@/lib/api/types";

/**
 * Route gate **and** the one place token renewal happens.
 *
 * Why renewal lives here rather than in the data layer: a Server Component
 * cannot write cookies (`cookies()` is read-only during a render). The refresh
 * token is single use, so renewing without persisting the new one would leave
 * the browser holding a token that is already dead. The proxy runs before every
 * render and BFF call and can still set cookies, so it renews pre-emptively and
 * the page always sees a fresh token (docs/specs/02-auth.md, docs/specs/21).
 *
 * With access tokens living 15 minutes this runs often, and a page fires many
 * requests at once — hence `renewTokens`, which spends each refresh token once
 * however many requests arrive holding it (docs/specs/21, R5).
 */

/**
 * Sends the visitor to sign in, carrying where they were headed.
 *
 * Straight to the OAuth2 login rather than to `/login`: while the identity
 * service still has a session for this browser, that is two redirects and no
 * password (docs/specs/21, R14).
 */
function redirectToLogin(request: NextRequest, { clear }: { clear: boolean }): NextResponse {
  const destination = request.nextUrl.pathname + request.nextUrl.search;
  const response = NextResponse.redirect(new URL(loginHref(destination), request.url));
  if (clear) clearSession(response);
  return response;
}

function clearSession(response: NextResponse): void {
  for (const name of SESSION_COOKIES) response.cookies.delete(name);
}

/**
 * Applies a renewed set to both sides of the exchange.
 *
 * `request.cookies.set` is what makes the **current** render see the new token;
 * `response.cookies.set` is what persists it in the browser. Doing only the
 * latter would leave this very request rendering with the stale token.
 */
function applyRenewedTokens(request: NextRequest, tokens: OAuthTokenResponse): NextResponse {
  const writes = tokenCookies(tokens);
  for (const { name, value } of writes) request.cookies.set(name, value);

  const response = NextResponse.next({ request });
  for (const { name, value, options } of writes) response.cookies.set(name, value, options);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(COOKIE.access)?.value;
  const refreshToken = request.cookies.get(COOKIE.refresh)?.value;
  const routeNeedsAuth = isProtectedPath(request.nextUrl.pathname);

  const accessIsUsable = !isTokenExpired(decodeAccessToken(accessToken));
  if (accessIsUsable) return NextResponse.next();

  // No way to recover a session: bounce protected routes, let public ones render
  // signed-out rather than forcing a login nobody asked for.
  if (!refreshToken) {
    return routeNeedsAuth ? redirectToLogin(request, { clear: true }) : NextResponse.next();
  }

  try {
    return applyRenewedTokens(request, await renewTokens(refreshToken));
  } catch (error) {
    // Only a refusal ends the session: clearing the cookies then stops every
    // later request from retrying a renewal that can only fail. Anything else —
    // the identity service down or slow — leaves the refresh token alone, since
    // it is still good and the next request may well renew it.
    const refused = isApiError(error) && error.code === ErrorCodes.SESSION_ENDED;
    if (!refused) console.warn("[auth] token renewal failed", error);

    if (routeNeedsAuth) return redirectToLogin(request, { clear: refused });

    const response = NextResponse.next();
    if (refused) clearSession(response);
    return response;
  }
}

export const config = {
  /**
   * Skips Next internals, the BFF's own auth routes (which manage cookies
   * themselves and would otherwise be renewed underneath) and static assets —
   * running renewal for every image request would be pure waste.
   */
  matcher: ["/((?!_next/static|_next/image|api/auth|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
