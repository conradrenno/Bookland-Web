/**
 * Access-token claims and session shape.
 *
 * Pure functions, no I/O and no Next.js APIs — safe to use from middleware
 * (Edge runtime), Server Components and tests alike.
 *
 * ⚠️ **We do not verify the signature.** The BFF only reads claims to drive UI
 * (greeting, hiding admin actions). The real check belongs to Spring, which
 * validates every call. Never grant access based on what this module returns —
 * treat it as a hint, and let the upstream 401/403 be the authority.
 */

import type { UserRole, UUID } from "@/lib/api/types";

/** Claims the Bookland access token carries (verified against a live token). */
export interface AccessTokenClaims {
  /** The user id. Note: `sub`, not `userId`. */
  sub: UUID;
  email: string;
  role: UserRole;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expiry, seconds since epoch. */
  exp: number;
}

/** What pages and layouts need to render an identity. */
export interface SessionUser {
  id: UUID;
  email: string;
  role: UserRole;
  isAdmin: boolean;
}

/** Renew this many ms before real expiry, so a call never races the deadline. */
export const EXPIRY_SKEW_MS = 30_000;

function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  // `atob` over Buffer: available in both the Edge and Node runtimes.
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  // Claims can hold non-ASCII (a name with an accent), so decode as UTF-8
  // instead of trusting `atob`'s latin1 output.
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isClaims(value: unknown): value is AccessTokenClaims {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sub === "string" &&
    typeof candidate.exp === "number" &&
    (candidate.role === "CUSTOMER" || candidate.role === "ADMIN")
  );
}

/**
 * Reads the claims out of a JWT without verifying it.
 * Returns `null` for anything unreadable — a corrupt cookie must degrade to
 * "signed out", never throw during a render.
 */
export function decodeAccessToken(token: string | undefined | null): AccessTokenClaims | null {
  if (!token) return null;

  const segments = token.split(".");
  if (segments.length !== 3) return null;

  try {
    const payload: unknown = JSON.parse(decodeBase64Url(segments[1]));
    return isClaims(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Is the token past its expiry (minus a safety margin)?
 *
 * The skew matters: a token with 2s left would pass a naive check and then be
 * rejected by Spring mid-request. Renewing slightly early avoids that race.
 */
export function isTokenExpired(
  claims: AccessTokenClaims | null,
  now: number = Date.now(),
): boolean {
  if (!claims) return true;
  return claims.exp * 1000 - EXPIRY_SKEW_MS <= now;
}

/** Projects claims into the identity the UI consumes. */
export function toSessionUser(claims: AccessTokenClaims | null): SessionUser | null {
  if (!claims) return null;
  return {
    id: claims.sub,
    email: claims.email,
    role: claims.role,
    isAdmin: claims.role === "ADMIN",
  };
}
