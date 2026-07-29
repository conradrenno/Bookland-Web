import { NextResponse } from "next/server";

import { logout } from "@/lib/api/auth";
import { clearTokens, readTokens } from "@/lib/auth/cookies";

/**
 * US-04 — ends the session.
 *
 * The local cookies are cleared **no matter what the upstream says**. If the
 * revoke call fails (network down, token already dead), refusing to sign the
 * user out would trap them in a session they explicitly asked to leave. The
 * upstream token expires on its own anyway.
 */
export async function POST(): Promise<NextResponse> {
  const { refreshToken } = await readTokens();

  if (refreshToken) {
    try {
      await logout({ refreshToken });
    } catch (error) {
      // Worth knowing about — it means a refresh token stayed valid upstream —
      // but never worth failing the request over.
      console.warn("[auth] upstream logout failed; clearing local session anyway", error);
    }
  }

  await clearTokens();
  return new NextResponse(null, { status: 204 });
}
