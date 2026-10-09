/**
 * Browser-side calls to the BFF's own auth routes.
 *
 * Distinct from `lib/api/auth.ts`, which runs on the server and talks to the
 * identity service. Nothing here ever sees a token (docs/specs/02-auth.md).
 *
 * Only registering is a `fetch`. Signing in and out are **navigations**: both
 * end in a redirect to the identity service, another origin, which `fetch`
 * cannot follow — see `loginHref` and `LOGOUT_ROUTE` (docs/specs/21).
 */

import { ErrorCodes } from "./error-codes";
import type { ApiErrorBody } from "./errors";
import type { RegisterRequest } from "./types";
import { toErrorBody } from "@/lib/forms/apply-api-error";

const REGISTER_ROUTE = "/api/auth/register";

/** Target of the sign-out form. A POST, so that a stray link cannot sign anyone out. */
export const LOGOUT_ROUTE = "/api/auth/logout";

export type AuthResult = { ok: true } | { ok: false; error: ApiErrorBody | null };

export async function signUp(input: RegisterRequest): Promise<AuthResult> {
  let response: Response;
  try {
    response = await fetch(REGISTER_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
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
