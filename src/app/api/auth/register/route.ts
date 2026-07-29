import { NextResponse } from "next/server";

import { register } from "@/lib/api/auth";
import type { RegisterRequest } from "@/lib/api/types";
import { writeTokens } from "@/lib/auth/cookies";
import { decodeAccessToken, toSessionUser } from "@/lib/auth/session";
import { malformedBody, readJsonBody, toErrorResponse, type AuthSuccessBody } from "../_shared";

/**
 * US-01 — registers and signs the new user in straight away.
 *
 * Upstream answers 201 with a token pair, so there is no separate login step.
 * A duplicate e-mail surfaces as 409 `EMAIL_ALREADY_EXISTS`, which the form
 * renders inline on the e-mail field rather than as a banner — the user has to
 * change that specific value (docs/specs/02-auth.md).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const input = await readJsonBody<RegisterRequest>(request);
  if (!input?.email || !input.password || !input.name) return malformedBody();

  try {
    const tokens = await register(input);
    await writeTokens(tokens);

    const body: AuthSuccessBody = { user: toSessionUser(decodeAccessToken(tokens.accessToken)) };
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
