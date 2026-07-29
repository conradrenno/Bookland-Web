/**
 * Central configuration for the BFF. All values come from the environment so
 * the same build runs against local Spring, staging, etc. See `.env.example`.
 */

/** Base URL of the Bookland Spring API. Server-side only — never sent to the browser. */
export const API_BASE_URL = (
  process.env.BOOKLAND_API_URL ?? "http://localhost:8080"
).replace(/\/$/, "");

/** Default timeout (ms) for a single upstream call before we give up. */
export const API_TIMEOUT_MS = Number(process.env.BOOKLAND_API_TIMEOUT_MS ?? 10_000);

/**
 * Cookie names for the JWT pair. The browser only ever sees httpOnly cookies —
 * it can read neither token from JS. The BFF reads them server-side to attach
 * the Authorization header to upstream calls (see `lib/api/client.ts`).
 */
export const COOKIE = {
  access: "bl_access",
  refresh: "bl_refresh",
} as const;

/** Are we serving over HTTPS? Controls the `Secure` cookie flag. */
export const IS_PROD = process.env.NODE_ENV === "production";

/** Default page size used across paginated storefront listings. */
export const DEFAULT_PAGE_SIZE = 20;
