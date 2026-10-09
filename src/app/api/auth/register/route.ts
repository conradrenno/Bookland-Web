import { NextResponse } from "next/server";

import { register } from "@/lib/api/auth";
import type { RegisterRequest } from "@/lib/api/types";
import { malformedBody, readJsonBody, toErrorResponse } from "@/app/api/_shared";

/**
 * US-01 — creates the account on the identity service.
 *
 * Answers 201 with **no session**: the identity service issues no token on
 * registration, so the form sends the new user through the normal login next,
 * where they type the password once more (docs/specs/21, decision 3).
 *
 * A duplicate e-mail surfaces as 409 `EMAIL_ALREADY_EXISTS`, which the form
 * renders inline on the e-mail field.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const input = await readJsonBody<RegisterRequest>(request);
  if (!input?.email || !input.password || !input.name) return malformedBody();

  try {
    // Only the three contract fields travel — never whatever else the body held.
    const { name, email, password } = input;
    await register({ name, email, password });
    return new NextResponse(null, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
