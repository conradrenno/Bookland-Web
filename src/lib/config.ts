/**
 * Central configuration for the BFF. All values come from the environment so
 * the same build runs against local Spring, staging, etc. See `.env.example`.
 */

/** Base URL of the Bookland Spring API. Server-side only — never sent to the browser. */
export const API_BASE_URL = (
  process.env.BOOKLAND_API_URL ?? "http://localhost:8080"
).replace(/\/$/, "");

/**
 * Public origin of media served by the API — today, covers uploaded through
 * `POST /books/{id}/cover`, which are stored as the relative path
 * `/media/covers/{uuid}.jpg` (see `lib/api/covers.ts`).
 *
 * Kept apart from `API_BASE_URL` because this one is *rendered into HTML*: an
 * image `src` must be an address Next's image optimiser can reach, which is not
 * necessarily the internal address the BFF calls. In dev they coincide.
 *
 * ⚠️ In production set `NEXT_PUBLIC_BOOKLAND_MEDIA_URL` explicitly. The fallback
 * reads `API_BASE_URL`, which is server-only: evaluated in a client bundle it
 * silently degrades to the localhost default.
 */
export const MEDIA_BASE_URL = (
  process.env.NEXT_PUBLIC_BOOKLAND_MEDIA_URL ?? API_BASE_URL
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

/**
 * Ceiling we impose on `size`. The upstream honours whatever it is given
 * (`?size=1000` returns the whole catalogue), so the guard has to live here —
 * otherwise a hand-edited URL turns one page render into an unbounded query.
 */
export const MAX_PAGE_SIZE = 60;
