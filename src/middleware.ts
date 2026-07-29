import { NextResponse, type NextRequest } from "next/server";

import { refresh as refreshUpstream } from "@/lib/api/auth";
import { COOKIE, IS_PROD } from "@/lib/config";
import { isProtectedPath } from "@/lib/auth/protected-routes";
import { decodeAccessToken, isTokenExpired } from "@/lib/auth/session";
import type { TokenViewModel } from "@/lib/api/types";

/**
 * Route gate **and** the place token renewal happens.
 *
 * Why renewal lives here rather than in the data layer: a Server Component
 * cannot write cookies (`cookies()` is read-only during a render). Since the
 * upstream *rotates* the refresh token, renewing without persisting the new one
 * would leave the browser holding a token that is already dead — the session
 * would break on the next request. Middleware is the one place that runs before
 * a render and can still set cookies, so it renews pre-emptively and the page
 * always sees a fresh token (docs/specs/02-auth.md).
 */

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  // Preserve where they were headed so login can send them back.
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(COOKIE.access);
  response.cookies.delete(COOKIE.refresh);
  return response;
}

function cookieOptions(expiresAt: string) {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  };
}

/**
 * Applies a renewed pair to both sides of the exchange.
 *
 * `request.cookies.set` is what makes the **current** render see the new token;
 * `response.cookies.set` is what persists it in the browser. Doing only the
 * latter would leave this very request rendering with the stale token.
 */
function applyRenewedTokens(request: NextRequest, tokens: TokenViewModel): NextResponse {
  request.cookies.set(COOKIE.access, tokens.accessToken);
  request.cookies.set(COOKIE.refresh, tokens.refreshToken);

  const response = NextResponse.next({ request });
  response.cookies.set(COOKIE.access, tokens.accessToken, cookieOptions(tokens.accessTokenExpiresAt));
  response.cookies.set(
    COOKIE.refresh,
    tokens.refreshToken,
    cookieOptions(tokens.refreshTokenExpiresAt),
  );
  return response;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(COOKIE.access)?.value;
  const refreshToken = request.cookies.get(COOKIE.refresh)?.value;
  const routeNeedsAuth = isProtectedPath(request.nextUrl.pathname);

  const accessIsUsable = !isTokenExpired(decodeAccessToken(accessToken));
  if (accessIsUsable) return NextResponse.next();

  // No way to recover a session: bounce protected routes, let public ones render
  // signed-out rather than forcing a login nobody asked for.
  if (!refreshToken) {
    return routeNeedsAuth ? redirectToLogin(request) : NextResponse.next();
  }

  try {
    return applyRenewedTokens(request, await refreshUpstream({ refreshToken }));
  } catch {
    // The refresh token is spent. Clearing the cookies here stops every later
    // request from retrying a renewal that can only fail again.
    if (routeNeedsAuth) return redirectToLogin(request);

    const response = NextResponse.next();
    response.cookies.delete(COOKIE.access);
    response.cookies.delete(COOKIE.refresh);
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
