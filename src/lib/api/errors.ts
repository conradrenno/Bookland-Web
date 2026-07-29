/**
 * `ApiError` — the single failure type the BFF raises.
 *
 * Every way a call can fail (HTTP error, unreachable upstream, timeout, body
 * that is not JSON) is funnelled here, so callers write one `catch` and branch
 * on `code`. Pure data + derived predicates: no I/O, importable from Client
 * Components that need to render a message.
 */

import { ErrorCodes, isFieldScopedCode, isRefreshableCode, type ErrorCode } from "./error-codes";
import {
  ERROR_DISPATCH_PATH,
  hasFieldErrors,
  isProblemDetail,
  PAYLOAD_LEVEL_ERROR_KEY,
  type ProblemDetail,
} from "./problem";

/** Serialisable shape sent back to the browser by BFF route handlers. */
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

interface ApiErrorInit {
  status: number;
  code: ErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
  /** Request path from the problem body; `/error` flags a masked server failure. */
  instance?: string;
  cause?: unknown;
}

export class ApiError extends Error {
  /** HTTP status, or `0` when the request never produced a response. */
  readonly status: number;
  readonly code: ErrorCode;
  readonly fieldErrors?: Record<string, string[]>;
  readonly instance?: string;

  constructor(init: ApiErrorInit) {
    super(init.message, { cause: init.cause });
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.fieldErrors = init.fieldErrors;
    this.instance = init.instance;
  }

  // --- classification -------------------------------------------------------

  /** Never reached the upstream: network failure or our own timeout. */
  get isTransport(): boolean {
    return this.status === 0;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** 409 / 422 — the request was understood and refused by a business rule. */
  get isConflict(): boolean {
    return this.status === 409 || this.status === 422;
  }

  /**
   * Upstream fault: a 5xx, or a response that came through Spring's `/error`
   * dispatch (which can wear a 401 while actually being a crash).
   */
  get isServerFault(): boolean {
    return this.status >= 500 || this.instance === ERROR_DISPATCH_PATH;
  }

  /**
   * A genuine authentication problem — as opposed to a server crash surfacing
   * as 401 from `/error`, which must not touch the session.
   */
  get isSessionProblem(): boolean {
    return this.status === 401 && !this.isServerFault;
  }

  /** Authenticated but not allowed. Distinct from `isSessionProblem`: never refresh on this. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /**
   * Should the auth layer spend a refresh on this?
   *
   * Only for token problems — a 401 from wrong login credentials or from a dead
   * refresh token must *not* trigger one, or a failed login would burn the
   * session. See 09-contract-notes.md item 12.
   */
  get shouldAttemptRefresh(): boolean {
    return this.isSessionProblem && isRefreshableCode(this.code);
  }

  /** Whether the message belongs beside a form field rather than in a banner. */
  get isFieldScoped(): boolean {
    return isFieldScopedCode(this.code) || this.fieldErrors !== undefined;
  }

  // --- accessors ------------------------------------------------------------

  /** Messages for one field, or `undefined` when that field is clean. */
  messagesFor(field: string): string[] | undefined {
    return this.fieldErrors?.[field];
  }

  /** Errors the upstream attached to the payload as a whole rather than a field. */
  get payloadLevelMessages(): string[] | undefined {
    return this.fieldErrors?.[PAYLOAD_LEVEL_ERROR_KEY];
  }

  toResponseBody(): ApiErrorBody {
    return { code: this.code, message: this.message, fieldErrors: this.fieldErrors };
  }

  // --- factories ------------------------------------------------------------

  /** Builds from a parsed RFC 7807 body. */
  static fromProblem(problem: ProblemDetail): ApiError {
    return new ApiError({
      status: problem.status,
      code: problem.code,
      message: problem.detail ?? problem.title,
      fieldErrors: hasFieldErrors(problem) ? problem.errors : undefined,
      instance: problem.instance,
    });
  }

  /**
   * Fallback for an error response we could not read as `problem+json` — an HTML
   * error page from a proxy, an empty body, a gateway in between.
   */
  static fromUnreadableResponse(status: number, statusText: string): ApiError {
    return new ApiError({
      status,
      code: ErrorCodes.UNKNOWN,
      message: statusText || `Upstream responded ${status}`,
    });
  }

  /** The upstream was unreachable. */
  static network(cause: unknown): ApiError {
    return new ApiError({
      status: 0,
      code: ErrorCodes.NETWORK_ERROR,
      message: "Could not reach the Bookland API",
      cause,
    });
  }

  /** We aborted first. */
  static timeout(timeoutMs: number): ApiError {
    return new ApiError({
      status: 0,
      code: ErrorCodes.TIMEOUT,
      message: `The Bookland API did not respond within ${timeoutMs}ms`,
    });
  }

  /** 2xx whose body was announced as JSON but did not parse. */
  static invalidResponse(status: number, cause: unknown): ApiError {
    return new ApiError({
      status,
      code: ErrorCodes.INVALID_RESPONSE,
      message: "The Bookland API returned a body that is not valid JSON",
      cause,
    });
  }
}

/**
 * Reads an error `Response` into an `ApiError`, falling back gracefully when the
 * body is not the envelope we expect.
 */
export async function parseUpstreamError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return ApiError.fromUnreadableResponse(response.status, response.statusText);
  }

  if (!isProblemDetail(body)) {
    return ApiError.fromUnreadableResponse(response.status, response.statusText);
  }

  // Trust the transport status over the one in the body: they should agree, and
  // if they ever disagree the real HTTP status is what routing and caching saw.
  const problem: ProblemDetail = { ...body, status: response.status };
  return ApiError.fromProblem(problem);
}

/** Type guard so callers can narrow inside a `catch`. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
