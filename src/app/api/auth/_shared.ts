/**
 * What is specific to the auth route handlers.
 *
 * Underscore-prefixed so the App Router does not treat this folder as a route
 * segment. The generic pieces (`toErrorResponse`, `readJsonBody`,
 * `malformedBody`) moved up to `app/api/_shared.ts` once the cart routes needed
 * the same three (stage 5a).
 */

import type { SessionUser } from "@/lib/auth/session";

/** What the browser gets back after a successful sign-in. Never the tokens. */
export interface AuthSuccessBody {
  user: SessionUser | null;
}
