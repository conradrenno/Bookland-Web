/**
 * Account creation on the identity service.
 *
 * The only auth call left that is a plain JSON API: signing in, renewing and
 * signing out are OAuth2 now, and live in `lib/auth/oauth.ts`. Registering
 * answers 201 with the account and **no token** — the new user signs in through
 * the normal flow afterwards (docs/specs/21, decision 3).
 *
 * Goes straight to the identity service: it is not behind the gateway.
 */

import { IDENTITY_BASE_URL } from "@/lib/config";
import { apiFetch } from "./client";
import type { RegisteredUserViewModel, RegisterRequest } from "./types";

export function register(input: RegisterRequest): Promise<RegisteredUserViewModel> {
  return apiFetch<RegisteredUserViewModel>("/api/v1/auth/register", {
    method: "POST",
    body: input,
    baseUrl: IDENTITY_BASE_URL,
  });
}
