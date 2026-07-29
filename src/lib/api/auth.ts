/**
 * Auth endpoints of the Bookland API.
 *
 * Plain calls over `apiFetch` — no cookies, no Next.js. Whoever calls these is
 * responsible for persisting the resulting tokens (see `lib/auth/cookies.ts`),
 * which keeps this module usable from middleware, route handlers and tests.
 */

import { apiFetch } from "./client";
import type {
  LoginRequest,
  LogoutRequest,
  RefreshTokenRequest,
  RegisterRequest,
  TokenViewModel,
} from "./types";

export function login(credentials: LoginRequest): Promise<TokenViewModel> {
  return apiFetch<TokenViewModel>("/api/v1/auth/login", {
    method: "POST",
    body: credentials,
  });
}

export function register(input: RegisterRequest): Promise<TokenViewModel> {
  return apiFetch<TokenViewModel>("/api/v1/auth/register", {
    method: "POST",
    body: input,
  });
}

/**
 * Exchanges a refresh token for a fresh pair.
 *
 * ⚠️ **Rotating**: the upstream invalidates the token passed in and returns a new
 * one. The caller *must* persist both tokens from the response — keeping the old
 * refresh cookie kills the session on the next renewal
 * (docs/specs/09-contract-notes.md item 12).
 */
export function refresh(input: RefreshTokenRequest): Promise<TokenViewModel> {
  return apiFetch<TokenViewModel>("/api/v1/auth/refresh", {
    method: "POST",
    body: input,
  });
}

/** Revokes the refresh token upstream. Answers 204, so there is no body. */
export function logout(input: LogoutRequest): Promise<void> {
  return apiFetch<void>("/api/v1/auth/logout", {
    method: "POST",
    body: input,
  });
}
