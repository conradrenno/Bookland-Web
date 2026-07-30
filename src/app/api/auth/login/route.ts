import { NextResponse } from "next/server";

import { login } from "@/lib/api/auth";
import type { LoginRequest } from "@/lib/api/types";
import { writeTokens } from "@/lib/auth/cookies";
import { decodeAccessToken, toSessionUser } from "@/lib/auth/session";
import { malformedBody, readJsonBody, toErrorResponse } from "@/app/api/_shared";
import type { AuthSuccessBody } from "../_shared";

/**
 * US-02 — signs in and stores the token pair as httpOnly cookies.
 *
 * The browser receives only the identity; the tokens never cross to the client.
 * A wrong password comes back as 401 `INVALID_CREDENTIALS`, which the login form
 * shows as a generic message — revealing which field was wrong would help an
 * attacker enumerate accounts.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const credentials = await readJsonBody<LoginRequest>(request);
  if (!credentials?.email || !credentials.password) return malformedBody();

  try {
    const tokens = await login(credentials);
    await writeTokens(tokens);

    const body: AuthSuccessBody = { user: toSessionUser(decodeAccessToken(tokens.accessToken)) };
    return NextResponse.json(body);
  } catch (error) {
    return toErrorResponse(error);
  }
}
