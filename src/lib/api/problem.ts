/**
 * RFC 7807 `application/problem+json` — the error envelope the Bookland API
 * returns for every non-2xx response.
 *
 * This module is *data only*: types plus the narrowing needed to trust an
 * `unknown` body coming off the wire. No behaviour, no I/O — so it is safe to
 * import from Client Components that render an error message.
 *
 * Contract reference: docs/specs/09-contract-notes.md items 12 and 13.
 */

/** Key used by the upstream for errors that belong to the payload as a whole. */
export const PAYLOAD_LEVEL_ERROR_KEY = "_";

/** Path reported in `instance` when Spring dispatched through its error handler. */
export const ERROR_DISPATCH_PATH = "/error";

export interface ProblemDetail {
  /** Omitted by the API while it is `about:blank`, which is always so far. */
  type?: string;
  /** HTTP reason phrase, e.g. "Unauthorized". */
  title: string;
  status: number;
  /**
   * Human-readable prose. Safe to show as a banner, but **never parse it** —
   * the backend documents it as reword-able at any time. Branch on `code`.
   */
  detail?: string;
  /** The request path. `/error` means the failure went through Spring's error dispatch. */
  instance?: string;
  /** Stable machine-readable symbol. The only field safe to branch on. */
  code: string;
}

/**
 * A `ProblemDetail` carrying the per-field breakdown of a rejected payload.
 * Values are always arrays: one field can break several constraints at once
 * (e.g. password too short *and* missing a digit).
 */
export interface ValidationProblemDetail extends ProblemDetail {
  errors: Record<string, string[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Narrows an arbitrary parsed body to a `ProblemDetail`.
 *
 * `status`, `title` and `code` are required by the upstream schema, so all three
 * must be present for us to trust the envelope; anything else is treated as a
 * foreign body and handled by the caller's fallback.
 */
export function isProblemDetail(value: unknown): value is ProblemDetail {
  if (!isRecord(value)) return false;
  return (
    typeof value.status === "number" &&
    typeof value.title === "string" &&
    typeof value.code === "string"
  );
}

/** True when the problem carries a usable field -> messages map. */
export function hasFieldErrors(problem: ProblemDetail): problem is ValidationProblemDetail {
  const errors = (problem as Partial<ValidationProblemDetail>).errors;
  if (!isRecord(errors)) return false;
  return Object.values(errors).every(
    (messages) => Array.isArray(messages) && messages.every((m) => typeof m === "string"),
  );
}

/**
 * True when the response came out of Spring's `/error` dispatch rather than a
 * real handler.
 *
 * Why this matters: a 401 from `/error` is a *server* failure wearing an auth
 * costume. Treating it as an expired session would make the BFF refresh, fail,
 * and log the user out while hiding a 500. See 09-contract-notes.md item 17 —
 * this was a live bug before the backend opened `/error`, and the guard stays
 * as cheap insurance against it regressing.
 */
export function isErrorDispatch(problem: ProblemDetail): boolean {
  return problem.instance === ERROR_DISPATCH_PATH;
}
