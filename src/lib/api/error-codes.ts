/**
 * Catalogue of `ProblemDetail.code` values, all observed against the running API
 * (docs/specs/09-contract-notes.md item 13).
 *
 * The backend keeps the canonical list in its own `docs/error-contract.md`; this
 * mirror exists so the BFF can branch with autocomplete instead of loose strings.
 */

export const ErrorCodes = {
  // --- auth: identity (401) -------------------------------------------------
  /** No `Authorization` header at all. */
  TOKEN_MISSING: "TOKEN_MISSING",
  /** Token present but corrupt / bad signature. */
  TOKEN_INVALID: "TOKEN_INVALID",
  /** Token well-formed but past `exp`. */
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  /** Wrong e-mail or password on login — never a reason to refresh. */
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  /** Refresh token unknown, already rotated, or revoked by logout. */
  INVALID_REFRESH_TOKEN: "INVALID_REFRESH_TOKEN",

  // --- auth: permission (403) ----------------------------------------------
  /** Authenticated, but the role does not cover this route. */
  INSUFFICIENT_ROLE: "INSUFFICIENT_ROLE",
  /** Reviewing a book without a DELIVERED order containing it. */
  PURCHASE_REQUIRED: "PURCHASE_REQUIRED",

  // --- request shape (400) --------------------------------------------------
  /** Bean Validation rejected the body; carries `errors` per field. */
  VALIDATION_ERROR: "VALIDATION_ERROR",
  /** Path/query parameter of the wrong type; carries `errors` per field. */
  INVALID_PARAMETER: "INVALID_PARAMETER",
  /** Body absent or not parseable as JSON. */
  MALFORMED_REQUEST: "MALFORMED_REQUEST",

  // --- business rules (404 / 409 / 422) ------------------------------------
  BOOK_NOT_FOUND: "BOOK_NOT_FOUND",
  /** Observed on `GET /categories/{id}/books` with an id that does not exist. */
  CATEGORY_NOT_FOUND: "CATEGORY_NOT_FOUND",
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  DUPLICATE_REVIEW: "DUPLICATE_REVIEW",
  /**
   * 409 on every cart write that would exceed stock — whether the book ran out
   * or the requested amount is simply more than exists. Verified 2026-07-29:
   * `POST` and `PATCH` both answer this, never `INSUFFICIENT_STOCK`.
   */
  CART_ITEM_UNAVAILABLE: "CART_ITEM_UNAVAILABLE",
  /**
   * Never observed on the cart, despite the name. Presumably reserved for the
   * checkout's re-validation; kept catalogued so a branch on it type-checks.
   */
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  /** 404 from `PATCH /cart/items/{bookId}` for a book the cart does not hold. */
  BOOK_NOT_IN_CART: "BOOK_NOT_IN_CART",
  /**
   * 404 when the customer has no cart row at all — distinct from an empty one.
   * `GET /cart` creates it on demand, so this only surfaces when a mutation is
   * the customer's very first cart call, or after the cart was dropped.
   *
   * Also what **checkout** answers for an empty cart (verified 2026-07-30) —
   * not a 409, and even when `GET /cart` is happily returning `items: []`.
   */
  CART_NOT_FOUND: "CART_NOT_FOUND",
  /** 404 from `GET /orders/{orderId}` for an id that does not exist. */
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  /**
   * 409 from `DELETE /orders/{orderId}` when the status forbids cancelling —
   * already `CANCELLED`, or past `SHIPPED`. What a second click answers, which
   * makes it the likeliest failure of the cancel flow (verified 2026-08-05).
   */
  ORDER_CANCELLATION_NOT_ALLOWED: "ORDER_CANCELLATION_NOT_ALLOWED",
  /**
   * 403 on another customer's order — reads *and* cancels alike, with the target
   * order left untouched (verified 2026-08-05). Note this is a **403, not a
   * 404**; the UI still shows "not found", so as not to confirm to a stranger
   * that the id is a real order. See docs/specs/20-orders-history.md.
   */
  ORDER_ACCESS_DENIED: "ORDER_ACCESS_DENIED",

  // --- server (500) ---------------------------------------------------------
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // --- client-side only: never sent by the API ------------------------------
  /** The upstream could not be reached (DNS, connection refused, socket drop). */
  NETWORK_ERROR: "NETWORK_ERROR",
  /** We gave up first — see `API_TIMEOUT_MS`. */
  TIMEOUT: "TIMEOUT",
  /** 2xx whose body did not parse as JSON: upstream broke its own contract. */
  INVALID_RESPONSE: "INVALID_RESPONSE",
  /** Fallback when the failure carries no usable code. */
  UNKNOWN: "UNKNOWN",
} as const;

export type KnownErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Open union: known codes autocomplete and typo-check, yet a code the backend
 * adds tomorrow still type-checks instead of breaking the build. The API owns
 * this vocabulary — the BFF must not assume it has seen all of it.
 */
export type ErrorCode = KnownErrorCode | (string & {});

/**
 * Codes meaning "this access token will not work, try renewing it".
 *
 * Both `TOKEN_EXPIRED` and `TOKEN_INVALID` are listed on purpose: only the
 * latter could be reproduced against the running API (access tokens live 24h),
 * so covering both keeps the refresh flow correct whichever one the backend
 * actually emits. See 09-contract-notes.md item 12.
 */
const REFRESHABLE_CODES: ReadonlySet<string> = new Set([
  ErrorCodes.TOKEN_EXPIRED,
  ErrorCodes.TOKEN_INVALID,
]);

export function isRefreshableCode(code: string | undefined): boolean {
  return code !== undefined && REFRESHABLE_CODES.has(code);
}

/** Codes whose messages belong next to a form field rather than in a banner. */
const FIELD_SCOPED_CODES: ReadonlySet<string> = new Set([
  ErrorCodes.VALIDATION_ERROR,
  ErrorCodes.INVALID_PARAMETER,
  ErrorCodes.EMAIL_ALREADY_EXISTS,
]);

export function isFieldScopedCode(code: string | undefined): boolean {
  return code !== undefined && FIELD_SCOPED_CODES.has(code);
}
