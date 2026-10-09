/**
 * The session, stored as httpOnly cookies so the browser can never read a token.
 *
 * Three tokens, one cookie each: `bl_access` goes on every upstream call,
 * `bl_refresh` renews it, and `bl_id` (the OIDC id_token) only ever travels
 * back to the identity service as `id_token_hint` at logout. A fourth cookie,
 * `bl_oauth`, holds a login in flight between `/api/auth/login` and the callback.
 *
 * The option builders are pure, so the proxy — which writes through
 * `response.cookies` — and the route handlers — which write through `cookies()`
 * — set exactly the same flags.
 *
 * ⚠️ **Where each wrapper may run.** Next only allows writes from Route
 * Handlers, Server Actions and the proxy. In a Server Component `cookies()` is
 * read-only and `.set()` throws, which is why renewal lives in the proxy
 * (docs/specs/02-auth.md, docs/specs/21).
 */

import { cookies } from "next/headers";

import { COOKIE, IS_PROD } from "@/lib/config";
import type { OAuthTokenResponse } from "@/lib/api/types";
import type { PendingLogin } from "./oauth";

export interface StoredTokens {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
}

/**
 * How long the refresh token lives. The token endpoint does not say, so this
 * mirrors the backend's `refresh-token-ttl-days` (7). Erring long is harmless:
 * a dead refresh token in a live cookie fails with `invalid_grant` and the
 * session ends the same way it would have.
 */
export const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60;

/** A login has ten minutes to come back from the identity service. */
export const PENDING_LOGIN_MAX_AGE = 10 * 60;

/** The only path the pending-login cookie is sent to. */
const CALLBACK_PATH = "/api/auth/callback";

/** Flags shared by every cookie. `Lax` suffices: the front only calls its own BFF. */
const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: "lax" as const,
  path: "/",
};

/** Clamped at zero: a negative Max-Age reads as "delete" to the browser. */
export function cookieOptions(maxAgeSeconds: number) {
  return { ...BASE_COOKIE_OPTIONS, maxAge: Math.max(0, Math.floor(maxAgeSeconds)) };
}

/** One cookie to set: name, value and options, in the shape both cookie APIs take. */
export interface CookieWrite {
  name: string;
  value: string;
  options: ReturnType<typeof cookieOptions>;
}

/**
 * The cookies a token response turns into.
 *
 * Always all three: the refresh token rotates on every renewal, so keeping the
 * old one would break the next renewal, and the id_token is reissued alongside.
 * The access cookie dies with the token (`expires_in`), so an expired access
 * token is usually simply absent rather than present and stale.
 */
export function tokenCookies(tokens: OAuthTokenResponse): CookieWrite[] {
  const writes: CookieWrite[] = [
    {
      name: COOKIE.access,
      value: tokens.access_token,
      options: cookieOptions(tokens.expires_in),
    },
    {
      name: COOKIE.refresh,
      value: tokens.refresh_token,
      options: cookieOptions(REFRESH_TOKEN_MAX_AGE),
    },
  ];
  // A refresh may come back without one; the previous id_token then still
  // names the same session, so it stays.
  if (tokens.id_token) {
    writes.push({
      name: COOKIE.id,
      value: tokens.id_token,
      options: cookieOptions(REFRESH_TOKEN_MAX_AGE),
    });
  }
  return writes;
}

/** Every session cookie, for deletion. */
export const SESSION_COOKIES = [COOKIE.access, COOKIE.refresh, COOKIE.id] as const;

// ---- pending login -----------------------------------------------------------

/**
 * Packs a pending login into one cookie value.
 *
 * `state` and `verifier` are base64url, so they never contain a dot. `next` can
 * (`encodeURIComponent` leaves dots alone), which is why it goes last and the
 * decoder splits on the first two dots only.
 */
export function encodePendingLogin({ state, verifier, next }: PendingLogin): string {
  return `${state}.${verifier}.${encodeURIComponent(next)}`;
}

export function decodePendingLogin(value: string | undefined): PendingLogin | null {
  if (!value) return null;
  const first = value.indexOf(".");
  const second = value.indexOf(".", first + 1);
  if (first <= 0 || second <= first + 1) return null;

  const state = value.slice(0, first);
  const verifier = value.slice(first + 1, second);
  try {
    return { state, verifier, next: decodeURIComponent(value.slice(second + 1)) };
  } catch {
    return null;
  }
}

export function pendingLoginCookie(pending: PendingLogin): CookieWrite {
  return {
    name: COOKIE.oauth,
    value: encodePendingLogin(pending),
    // Scoped to the callback: no other request needs to carry it.
    options: { ...cookieOptions(PENDING_LOGIN_MAX_AGE), path: CALLBACK_PATH },
  };
}

/** Deleting a cookie needs the same path it was set with. */
export const PENDING_LOGIN_DELETE = { name: COOKIE.oauth, path: CALLBACK_PATH } as const;

// ---- `cookies()` wrappers (Route Handlers only, for writes) -------------------

export async function readTokens(): Promise<StoredTokens> {
  const store = await cookies();
  return {
    accessToken: store.get(COOKIE.access)?.value,
    refreshToken: store.get(COOKIE.refresh)?.value,
    idToken: store.get(COOKIE.id)?.value,
  };
}

export async function writeTokens(tokens: OAuthTokenResponse): Promise<void> {
  const store = await cookies();
  for (const { name, value, options } of tokenCookies(tokens)) store.set(name, value, options);
}

export async function clearTokens(): Promise<void> {
  const store = await cookies();
  for (const name of SESSION_COOKIES) store.delete(name);
}
