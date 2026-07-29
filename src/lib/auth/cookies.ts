/**
 * The token pair, stored as httpOnly cookies so the browser can never read it.
 *
 * ⚠️ **Where each function may run.** Next only allows writes from Route
 * Handlers, Server Actions and Middleware. In a Server Component `cookies()` is
 * read-only and `.set()` throws. That constraint shapes the whole refresh
 * design — see docs/specs/02-auth.md.
 *
 * | Function        | Server Component | Route Handler | Middleware |
 * |-----------------|------------------|---------------|------------|
 * | `readTokens`    | ✅               | ✅            | (use request.cookies) |
 * | `writeTokens`   | ❌ throws        | ✅            | (use response.cookies) |
 * | `clearTokens`   | ❌ throws        | ✅            | (use response.cookies) |
 */

import { cookies } from "next/headers";

import { COOKIE, IS_PROD } from "@/lib/config";
import type { TokenViewModel } from "@/lib/api/types";

export interface StoredTokens {
  accessToken?: string;
  refreshToken?: string;
}

/** Flags shared by both cookies. `Lax` suffices: the front only calls its own BFF. */
const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: "lax",
  path: "/",
} as const;

/**
 * Max-Age derived from the token's own expiry, so the cookie dies with it.
 * Clamped at zero because a clock skew that yields a negative age would make the
 * browser treat the cookie as a delete instruction.
 */
function maxAgeSeconds(expiresAt: string, now: number = Date.now()): number {
  const remainingMs = new Date(expiresAt).getTime() - now;
  return Math.max(0, Math.floor(remainingMs / 1000));
}

export function cookieOptionsFor(expiresAt: string, now?: number) {
  return { ...BASE_COOKIE_OPTIONS, maxAge: maxAgeSeconds(expiresAt, now) };
}

export async function readTokens(): Promise<StoredTokens> {
  const store = await cookies();
  return {
    accessToken: store.get(COOKIE.access)?.value,
    refreshToken: store.get(COOKIE.refresh)?.value,
  };
}

/**
 * Persists a freshly issued pair.
 *
 * Always writes **both** — the upstream rotates the refresh token on every
 * renewal, so keeping the previous one would break the next refresh.
 */
export async function writeTokens(tokens: TokenViewModel): Promise<void> {
  const store = await cookies();
  store.set(COOKIE.access, tokens.accessToken, cookieOptionsFor(tokens.accessTokenExpiresAt));
  store.set(COOKIE.refresh, tokens.refreshToken, cookieOptionsFor(tokens.refreshTokenExpiresAt));
}

export async function clearTokens(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE.access);
  store.delete(COOKIE.refresh);
}
