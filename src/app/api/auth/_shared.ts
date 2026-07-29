/**
 * Helpers shared by the auth route handlers.
 *
 * Underscore-prefixed so the App Router does not treat this folder as a route
 * segment.
 */

import { NextResponse } from "next/server";

import { isApiError } from "@/lib/api/errors";
import type { SessionUser } from "@/lib/auth/session";

/** What the browser gets back after a successful sign-in. Never the tokens. */
export interface AuthSuccessBody {
  user: SessionUser | null;
}

/**
 * Translates a failure into the response the browser sees.
 *
 * Upstream `ApiError`s are forwarded with their status and `code` so the form
 * can place the message on the right field. Anything else is a bug on our side
 * and collapses into a generic 500 — leaking a stack trace to the browser would
 * be worse than an unhelpful message.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (isApiError(error)) {
    return NextResponse.json(error.toResponseBody(), { status: error.status || 502 });
  }

  console.error("[auth] unexpected failure", error);
  return NextResponse.json(
    { code: "UNKNOWN", message: "Não foi possível concluir a operação." },
    { status: 500 },
  );
}

/** Reads and shallowly validates a JSON body, rejecting a malformed one early. */
export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function malformedBody(): NextResponse {
  return NextResponse.json(
    { code: "MALFORMED_REQUEST", message: "Corpo da requisição inválido." },
    { status: 400 },
  );
}
