import { NextResponse } from "next/server";

import { isApiError } from "@/lib/api/errors";
import { clearTokens, readTokens, writeTokens } from "@/lib/auth/cookies";
import { renewTokens } from "@/lib/auth/refresh";
import { decodeAccessToken, toSessionUser } from "@/lib/auth/session";
import { toErrorResponse } from "@/app/api/_shared";
import type { AuthSuccessBody } from "../_shared";

/**
 * US-03 — renews the token pair.
 *
 * Exists as a route handler because renewal has to **write** cookies, which a
 * Server Component cannot do. The middleware handles the common case ahead of a
 * page render; this endpoint covers client-driven renewal.
 *
 * Both cookies are rewritten: the upstream rotates the refresh token, so keeping
 * the old one would break the next renewal.
 */
export async function POST(): Promise<NextResponse> {
  const { refreshToken } = await readTokens();

  if (!refreshToken) {
    return NextResponse.json(
      { code: "TOKEN_MISSING", message: "Sessão não encontrada." },
      { status: 401 },
    );
  }

  try {
    const tokens = await renewTokens(refreshToken);
    await writeTokens(tokens);

    const body: AuthSuccessBody = { user: toSessionUser(decodeAccessToken(tokens.accessToken)) };
    return NextResponse.json(body);
  } catch (error) {
    // A refused renewal is terminal: the stored refresh token is dead and no
    // retry will revive it, so drop the cookies rather than leave the browser
    // presenting credentials that can only fail.
    if (isApiError(error) && error.status === 401) {
      await clearTokens();
    }
    return toErrorResponse(error);
  }
}
