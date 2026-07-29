/**
 * Browser-side calls to the BFF's own auth routes.
 *
 * Distinct from `lib/api/auth.ts`, which runs on the server and talks to Spring.
 * The difference matters: nothing here ever sees a token — the route handler
 * answers with `Set-Cookie` (httpOnly) and an identity, so the tokens stay out
 * of reach of any script on the page (docs/specs/02-auth.md).
 */

import { ErrorCodes } from "./error-codes";
import type { ApiErrorBody } from "./errors";
import type { LoginRequest, RegisterRequest } from "./types";
import { toErrorBody } from "@/lib/forms/apply-api-error";

export const AUTH_ROUTES = {
  login: "/api/auth/login",
  register: "/api/auth/register",
  logout: "/api/auth/logout",
} as const;

export type AuthResult = { ok: true } | { ok: false; error: ApiErrorBody | null };

async function post(route: string, payload: unknown): Promise<AuthResult> {
  let response: Response;
  try {
    response = await fetch(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Never reached the BFF — offline, DNS, connection dropped. Shaped like an
    // error body so the caller has a single path to render.
    return {
      ok: false,
      error: { code: ErrorCodes.NETWORK_ERROR, message: "Could not reach the BFF" },
    };
  }

  if (response.ok) return { ok: true };

  // A failing response should carry our envelope, but a crash upstream of the
  // handler (or a proxy) can return HTML instead — tolerate it.
  const body: unknown = await response.json().catch(() => null);
  return { ok: false, error: toErrorBody(body) };
}

export function signIn(credentials: LoginRequest): Promise<AuthResult> {
  return post(AUTH_ROUTES.login, credentials);
}

export function signUp(input: RegisterRequest): Promise<AuthResult> {
  return post(AUTH_ROUTES.register, input);
}

export function signOut(): Promise<AuthResult> {
  return post(AUTH_ROUTES.logout, {});
}
