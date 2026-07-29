/**
 * Gateway to the Bookland API.
 *
 * Owns the plumbing every upstream call repeats — URL and query assembly, JSON
 * encoding, bearer injection, timeout, and turning any failure into an
 * `ApiError`. It knows nothing about books, carts or Next.js routing: resource
 * modules (`books.ts`, `cart.ts`, …) sit on top of it.
 *
 * HTTP is exercised in tests through MSW, which intercepts at the network level
 * — see docs/specs/10-testing.md.
 */

import { API_BASE_URL, API_TIMEOUT_MS } from "@/lib/config";
import { ApiError, parseUpstreamError } from "./errors";
import { buildUrl, type QueryParams } from "./url";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestOptions {
  method?: HttpMethod;
  query?: QueryParams;
  /** Serialised as JSON. Omit for bodyless verbs. */
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * Bearer token for this call. Passed explicitly rather than read from cookies
   * here: that would tie this module to `next/headers`, making it unusable
   * outside a request scope. The auth layer supplies it.
   */
  accessToken?: string | null;
  /** Caller-owned cancellation, composed with the internal timeout. */
  signal?: AbortSignal;
  /** Per-call override of `API_TIMEOUT_MS`. */
  timeoutMs?: number;
}

/** Statuses that carry no body by definition — parsing them would throw. */
const BODILESS_STATUSES: ReadonlySet<number> = new Set([204, 205, 304]);

/**
 * Performs an upstream call and returns the decoded body.
 *
 * `T` is `void` for 204 responses. Throws `ApiError` on any failure — callers
 * need a single `catch`.
 */
export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, headers, accessToken, signal, timeoutMs } = options;
  const effectiveTimeout = timeoutMs ?? API_TIMEOUT_MS;

  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), effectiveTimeout);
  // Either the caller or our timer can cancel; whichever fires first wins.
  const composedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetch(buildUrl(API_BASE_URL, path, query), {
      method,
      headers: buildHeaders({ headers, accessToken, hasBody: body !== undefined }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: composedSignal,
      // Everything here is either per-user (cart, orders) or must reflect writes
      // immediately. Page-level caching is Next's job, in the Server Component.
      cache: "no-store",
    });

    if (!response.ok) throw await parseUpstreamError(response);
    return (await decodeBody<T>(response)) as T;
  } catch (error) {
    throw normaliseThrown(error, {
      timedOut: timeoutController.signal.aborted,
      timeoutMs: effectiveTimeout,
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildHeaders(input: {
  headers?: Record<string, string>;
  accessToken?: string | null;
  hasBody: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    // Success responses are declared `*/*` upstream but are always JSON;
    // problem+json covers the error envelope.
    Accept: "application/json, application/problem+json",
    ...input.headers,
  };
  if (input.hasBody) headers["Content-Type"] = "application/json";
  if (input.accessToken) headers.Authorization = `Bearer ${input.accessToken}`;
  return headers;
}

/**
 * Reads a successful response.
 *
 * 204 is a real outcome here — logout, deletes and the refund endpoint all use
 * it — and calling `.json()` on an empty body throws, so it must be checked
 * before parsing (docs/specs/09-contract-notes.md item 15).
 */
async function decodeBody<T>(response: Response): Promise<T | undefined> {
  if (BODILESS_STATUSES.has(response.status)) return undefined;

  const raw = await response.text();
  if (raw.length === 0) return undefined;

  try {
    return JSON.parse(raw) as T;
  } catch (cause) {
    throw ApiError.invalidResponse(response.status, cause);
  }
}

/**
 * Maps anything thrown during a call onto `ApiError`.
 *
 * An abort is ambiguous: it means "we timed out" only when our own controller
 * fired — a caller-initiated cancel must propagate untouched so React can
 * discard a superseded render without it looking like an upstream failure.
 */
function normaliseThrown(
  error: unknown,
  context: { timedOut: boolean; timeoutMs: number },
): unknown {
  if (error instanceof ApiError) return error;

  const isAbort = error instanceof Error && error.name === "AbortError";
  if (isAbort) {
    return context.timedOut ? ApiError.timeout(context.timeoutMs) : error;
  }
  return ApiError.network(error);
}
