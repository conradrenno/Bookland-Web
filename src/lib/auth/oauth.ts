/**
 * The BFF as an OAuth2 client of the identity service (docs/specs/21).
 *
 * The BFF is a **confidential** client running the authorization code flow
 * with PKCE: the browser is sent to the Authorization Server to type the
 * password, comes back with a one-time code, and the BFF exchanges that code
 * server-side — authenticating with the client secret — for the tokens, which
 * never leave the server except as httpOnly cookies.
 *
 * Plain functions over `fetch`, with no cookies and no Next.js, so they run in
 * the proxy, in route handlers and under MSW alike. Not built on `apiFetch`:
 * the token endpoint takes a form body, answers OAuth2 errors rather than
 * problem+json, and lives on another origin.
 */

import {
  API_TIMEOUT_MS,
  BFF_BASE_URL,
  IDENTITY_BASE_URL,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
} from "@/lib/config";
import { ApiError } from "@/lib/api/errors";
import { ErrorCodes } from "@/lib/api/error-codes";
import type { OAuthTokenResponse } from "@/lib/api/types";

/** Where the Authorization Server sends the browser back. Registered for the client upstream. */
export const REDIRECT_URI = `${BFF_BASE_URL}/api/auth/callback`;

/** Where `/connect/logout` sends the browser once the identity session is over. */
export const POST_LOGOUT_REDIRECT_URI = `${BFF_BASE_URL}/`;

/**
 * `openid` is what makes the server issue an id_token, which logout needs.
 * `profile` and `email` are the client's other scopes; the claims the UI reads
 * (`name`, `email`, `role`) are on the access token either way.
 */
const SCOPE = "openid profile email";

// ---- PKCE -------------------------------------------------------------------

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A URL-safe random string — 32 bytes give the 43 characters RFC 7636 asks for at minimum. */
export function randomToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** `S256` challenge: base64url(SHA-256(verifier)). */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** Everything a login in flight has to remember until the callback. */
export interface PendingLogin {
  /** Echoed back by the server; proves the callback answers *our* request (CSRF). */
  state: string;
  /** Proves to the token endpoint that whoever exchanges the code started the flow. */
  verifier: string;
  /** Sanitised path to land on afterwards. */
  next: string;
}

/** Starts a login: fresh state and verifier, plus the challenge derived from it. */
export async function beginLogin(next: string): Promise<{ pending: PendingLogin; url: string }> {
  const pending: PendingLogin = { state: randomToken(), verifier: randomToken(), next };
  const url = buildAuthorizeUrl({
    state: pending.state,
    challenge: await challengeFor(pending.verifier),
  });
  return { pending, url };
}

export function buildAuthorizeUrl({ state, challenge }: { state: string; challenge: string }) {
  const url = new URL("/oauth2/authorize", IDENTITY_BASE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

/**
 * RP-initiated logout. The parameters go in the **query string**: on a GET the
 * server reads them from nowhere else (docs/specs/21, stage 1).
 */
export function buildEndSessionUrl(idToken: string): string {
  const url = new URL("/connect/logout", IDENTITY_BASE_URL);
  url.search = new URLSearchParams({
    id_token_hint: idToken,
    post_logout_redirect_uri: POST_LOGOUT_REDIRECT_URI,
  }).toString();
  return url.toString();
}

// ---- token endpoint -----------------------------------------------------------

function clientAuthorization(): string {
  if (!OAUTH_CLIENT_SECRET) {
    // Caught here rather than at startup so the public storefront still renders
    // without it; only signing in needs the secret.
    throw new ApiError({
      status: 500,
      code: ErrorCodes.OAUTH_REJECTED,
      message: "BOOKLAND_OAUTH_CLIENT_SECRET is not set",
    });
  }
  // RFC 6749 §2.3.1 form-encodes id and secret before joining them.
  const credentials = `${encodeURIComponent(OAUTH_CLIENT_ID)}:${encodeURIComponent(OAUTH_CLIENT_SECRET)}`;
  return `Basic ${btoa(credentials)}`;
}

/**
 * Maps an OAuth2 error body (`{"error": "invalid_grant", ...}`) to `ApiError`.
 *
 * Only `invalid_grant` is the user's: the code or refresh token is spent,
 * revoked, expired or belongs to an account that is gone. Everything else —
 * above all `invalid_client` — means the BFF is misconfigured.
 */
async function oauthError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  const error = typeof body?.error === "string" ? body.error : undefined;

  if (error === "invalid_grant") {
    return new ApiError({
      status: 401,
      code: ErrorCodes.SESSION_ENDED,
      message: "The authorization server refused the grant",
    });
  }
  return new ApiError({
    status: 500,
    code: ErrorCodes.OAUTH_REJECTED,
    message: `The authorization server answered ${response.status} ${error ?? ""}`.trim(),
  });
}

async function postForm(path: string, params: Record<string, string>): Promise<Response> {
  try {
    return await fetch(new URL(path, IDENTITY_BASE_URL), {
      method: "POST",
      headers: {
        Authorization: clientAuthorization(),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw ApiError.timeout(API_TIMEOUT_MS);
    }
    throw ApiError.network(error);
  }
}

async function requestTokens(params: Record<string, string>): Promise<OAuthTokenResponse> {
  const response = await postForm("/oauth2/token", params);
  if (!response.ok) throw await oauthError(response);
  return (await response.json()) as OAuthTokenResponse;
}

/** Exchanges the one-time code from the callback for the token set. */
export function exchangeCode({
  code,
  verifier,
}: {
  code: string;
  verifier: string;
}): Promise<OAuthTokenResponse> {
  return requestTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });
}

/**
 * Trades a refresh token for a new set.
 *
 * ⚠️ **Single use**: the token sent is dead once this succeeds, and the response
 * carries its replacement. Never call this directly from a request path — go
 * through `renewTokens`, which keeps concurrent callers from spending the same
 * token twice (`lib/auth/refresh.ts`).
 */
export function refreshTokens(refreshToken: string): Promise<OAuthTokenResponse> {
  return requestTokens({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/**
 * Revokes a refresh token. The server answers 200 whether or not the token was
 * still alive (RFC 7009), so only a transport or client failure throws.
 *
 * Needed at logout because ending the identity session does not, by itself,
 * invalidate a refresh token the BFF already holds (docs/specs/21, R4).
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const response = await postForm("/oauth2/revoke", {
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
  if (!response.ok) throw await oauthError(response);
}
