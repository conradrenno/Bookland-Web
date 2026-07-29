/**
 * Which pages require a session.
 *
 * Pure and separate from the middleware so the matching rules can be tested
 * without standing up a request — prefix matching is easy to get subtly wrong.
 */

/** Everything not listed here renders publicly, signed in or not. */
export const PROTECTED_PREFIXES = ["/cart", "/checkout", "/orders", "/account"] as const;

/**
 * Matches a prefix only at a path boundary.
 *
 * `/cart` must protect `/cart` and `/cart/items` but **not** `/cartografia` —
 * a naive `startsWith` would lock a public page nobody meant to protect.
 */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
