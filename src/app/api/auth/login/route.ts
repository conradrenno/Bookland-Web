import { NextResponse, type NextRequest } from "next/server";

import { BFF_BASE_URL, COOKIE } from "@/lib/config";
import { pendingLoginCookie } from "@/lib/auth/cookies";
import { resolveAfterAuthPath } from "@/lib/auth/next-path";
import { beginLogin } from "@/lib/auth/oauth";
import { decodeAccessToken, isTokenExpired } from "@/lib/auth/session";

/**
 * US-02 — starts the OAuth2 login (docs/specs/21, stage 3).
 *
 * Remembers a fresh `state` and PKCE verifier in a short-lived httpOnly cookie
 * and sends the browser to the identity service, where the password is typed.
 * The browser comes back to `/api/auth/callback`.
 *
 * A GET, because every way in is a navigation — a link, a redirect from the
 * proxy, `window.location.assign`. It sets a cookie, which is a side effect,
 * but a harmless one: a stray hit just starts a login nobody finishes.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // The pending-login cookie is bound to the host it was set on. Started on
  // `localhost`, it would never reach the callback on `127.0.0.1` — so move to
  // the BFF's own origin first, then start.
  const canonical = new URL(BFF_BASE_URL);
  if (request.headers.get("host") !== canonical.host) {
    return NextResponse.redirect(
      new URL(request.nextUrl.pathname + request.nextUrl.search, canonical),
      307,
    );
  }

  // Sanitised before it is stored: the raw value is attacker controlled. A
  // repeated `next` stays an array, which the resolver refuses outright.
  const values = request.nextUrl.searchParams.getAll("next");
  const next = resolveAfterAuthPath(values.length > 1 ? values : values[0]);

  // Already signed in — nothing to do but go on.
  const access = decodeAccessToken(request.cookies.get(COOKIE.access)?.value);
  if (!isTokenExpired(access)) {
    return NextResponse.redirect(new URL(next, canonical));
  }

  const { pending, url } = await beginLogin(next);
  const response = NextResponse.redirect(url);
  const cookie = pendingLoginCookie(pending);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
