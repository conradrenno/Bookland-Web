import { NextResponse, type NextRequest } from "next/server";

import { isApiError } from "@/lib/api/errors";
import { BFF_BASE_URL, COOKIE } from "@/lib/config";
import { decodePendingLogin, PENDING_LOGIN_DELETE, tokenCookies } from "@/lib/auth/cookies";
import { resolveAfterAuthPath, withNextParam } from "@/lib/auth/next-path";
import type { LoginFailure } from "@/lib/auth/login-failure";
import { exchangeCode } from "@/lib/auth/oauth";

/**
 * US-02 — where the identity service sends the browser back (docs/specs/21).
 *
 * Checks that the answer belongs to a login this browser started (`state`),
 * exchanges the one-time code for the tokens — proving with the PKCE verifier
 * that it is the same party that started — and stores them as httpOnly cookies.
 * The browser never sees a token, only a redirect.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const pending = decodePendingLogin(request.cookies.get(COOKIE.oauth)?.value);
  const next = resolveAfterAuthPath(pending?.next);

  if (params.has("error")) {
    return failure(params.get("error") === "access_denied" ? "denied" : "failed", next);
  }

  const code = params.get("code");
  // Compared with the cookie, not just checked for presence: a callback whose
  // `state` this browser did not create is a login CSRF attempt — someone
  // trying to sign the victim into the attacker's account.
  if (!pending || !code || params.get("state") !== pending.state) {
    return failure("expired", next);
  }

  try {
    const tokens = await exchangeCode({ code, verifier: pending.verifier });

    const response = NextResponse.redirect(new URL(next, BFF_BASE_URL));
    for (const { name, value, options } of tokenCookies(tokens)) {
      response.cookies.set(name, value, options);
    }
    response.cookies.delete(PENDING_LOGIN_DELETE);
    return response;
  } catch (error) {
    console.error("[auth] code exchange failed", error);
    return failure(isApiError(error) && error.isTransport ? "unavailable" : "failed", next);
  }
}

/** Back to `/login` with the reason, keeping the destination for "try again". */
function failure(reason: LoginFailure, next: string): NextResponse {
  const target = new URL(withNextParam("/login", next), BFF_BASE_URL);
  target.searchParams.set("error", reason);

  const response = NextResponse.redirect(target);
  // Spent either way: a pending login is good for one callback.
  response.cookies.delete(PENDING_LOGIN_DELETE);
  return response;
}
