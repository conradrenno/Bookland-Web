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
 * Base URL of the identity service — the OAuth2 Authorization Server, plus
 * `register` and the user account. **Not** behind the gateway: the token issuer
 * has to keep the address the browser logs in on (docs/specs/21).
 *
 * `127.0.0.1`, not `localhost`: it is the issuer the tokens carry, and the
 * server refuses `localhost` redirect URIs (RFC 8252).
 */
export const IDENTITY_BASE_URL = (
  process.env.BOOKLAND_IDENTITY_URL ?? "http://127.0.0.1:9000"
).replace(/\/$/, "");

/**
 * Public origin of this BFF — what the Authorization Server redirects back to.
 * Must match a redirect URI registered for the client, character for character.
 */
export const BFF_BASE_URL = (process.env.BOOKLAND_BFF_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);

/** The OAuth2 client the BFF signs in as. Shared with the backend's Swagger UIs (docs/specs/21). */
export const OAUTH_CLIENT_ID = process.env.BOOKLAND_OAUTH_CLIENT_ID ?? "bookland-web";

/**
 * The client's secret — the BFF is a **confidential** client, which is the whole
 * point of running the flow server-side. Server-only: never prefix it with
 * `NEXT_PUBLIC_`.
 *
 * No default on purpose: the backend's dev profile and its compose stack use
 * different secrets, and guessing wrong surfaces as a baffling `invalid_client`.
 * An empty value is caught where the secret is used.
 */
export const OAUTH_CLIENT_SECRET = process.env.BOOKLAND_OAUTH_CLIENT_SECRET ?? "";

/**
 * Cookie names. The browser only ever sees httpOnly cookies — it can read none
 * of the tokens from JS. The BFF reads them server-side to attach the
 * Authorization header to upstream calls (see `lib/api/client.ts`).
 */
export const COOKIE = {
  access: "bl_access",
  refresh: "bl_refresh",
  /** The OIDC id_token. Only ever sent back as `id_token_hint` at logout. */
  id: "bl_id",
  /** State, PKCE verifier and `next` of a login in flight. Lives ten minutes. */
  oauth: "bl_oauth",
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
