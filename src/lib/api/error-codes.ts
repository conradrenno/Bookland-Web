/**
 * Catalogue of `ProblemDetail.code` values.
 *
 * The backend keeps the canonical list in its own `docs/error-contract.md`; this
 * mirror exists so the BFF can branch with autocomplete instead of loose strings.
 * Last checked against it on 2026-10-09 (docs/specs/21-backend-alignment.md).
 */

export const ErrorCodes = {
  // --- auth: identity (401) -------------------------------------------------
  /** No `Authorization` header at all. */
  TOKEN_MISSING: "TOKEN_MISSING",
  /**
   * Token present but corrupt / bad signature. **Not** worth a refresh: the
   * contract says to end the session (docs/specs/21, R1).
   */
  TOKEN_INVALID: "TOKEN_INVALID",
  /** Token well-formed but past `exp` — the one code that is worth a refresh. */
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  /**
   * @deprecated Produced by the home-grown login, which no longer exists — a
   * wrong password is now answered by the identity service's own login page.
   * Removed in stage 3 of docs/specs/21.
   */
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  /** @deprecated Same as `INVALID_CREDENTIALS`; a dead refresh token is now OAuth2's `invalid_grant`. */
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
  /** A domain argument the use case refused (any module). */
  INVALID_ARGUMENT: "INVALID_ARGUMENT",

  // --- user (identity service) ----------------------------------------------
  USER_NOT_FOUND: "USER_NOT_FOUND",
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  /** 403 on someone else's account. */
  USER_ACCESS_DENIED: "USER_ACCESS_DENIED",
  ADMIN_ACCOUNT_NOT_DELETABLE: "ADMIN_ACCOUNT_NOT_DELETABLE",

  // --- catalogue ------------------------------------------------------------
  BOOK_NOT_FOUND: "BOOK_NOT_FOUND",
  /** Observed on `GET /categories/{id}/books` with an id that does not exist. */
  CATEGORY_NOT_FOUND: "CATEGORY_NOT_FOUND",
  ISBN_ALREADY_EXISTS: "ISBN_ALREADY_EXISTS",
  BOOK_HAS_ACTIVE_ORDERS: "BOOK_HAS_ACTIVE_ORDERS",
  /** 422 from the catalogue's inventory. Never observed on the cart. */
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  INVALID_IMAGE: "INVALID_IMAGE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  /**
   * 503 from removing a book: the catalogue could not ask orders whether the
   * book has active orders, so it refused. Admin-only (phase 2).
   */
  ORDERS_UNAVAILABLE: "ORDERS_UNAVAILABLE",

  // --- cart and checkout ----------------------------------------------------
  /**
   * 409 on every cart write that would exceed stock — whether the book ran out
   * or the requested amount is simply more than exists. Also what the checkout
   * answers when the shortage is visible before it starts.
   */
  CART_ITEM_UNAVAILABLE: "CART_ITEM_UNAVAILABLE",
  /** 404 from `PATCH /cart/items/{bookId}` for a book the cart does not hold. */
  BOOK_NOT_IN_CART: "BOOK_NOT_IN_CART",
  /**
   * 404 when changing an item of a cart that does not exist. `GET /cart` no
   * longer creates one, so a customer's first cart write may meet this.
   */
  CART_NOT_FOUND: "CART_NOT_FOUND",
  /** 409 from checkout with an empty or missing cart (it used to be a 404 `CART_NOT_FOUND`). */
  CART_EMPTY: "CART_EMPTY",
  /** 409 from checkout while an earlier checkout of this customer is still running. */
  CHECKOUT_IN_PROGRESS: "CHECKOUT_IN_PROGRESS",
  /**
   * 503 from orders, wishlist or reviews when the catalogue could not be asked
   * about a book. Reading the cart or the wishlist does **not** fail with it —
   * those show the items as unavailable instead. Worth a retry.
   */
  CATALOG_UNAVAILABLE: "CATALOG_UNAVAILABLE",

  // --- orders ---------------------------------------------------------------
  /** 404 from `GET /orders/{orderId}` for an id that does not exist. */
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  /**
   * 409 from `DELETE /orders/{orderId}` when the status forbids cancelling. Only
   * `CONFIRMED` may be cancelled — this is also the answer while the checkout is
   * still running (`PENDING`, `AWAITING_PAYMENT`).
   */
  ORDER_CANCELLATION_NOT_ALLOWED: "ORDER_CANCELLATION_NOT_ALLOWED",
  /**
   * 403 on another customer's order — reads *and* cancels alike, with the target
   * order left untouched (verified 2026-08-05). Note this is a **403, not a
   * 404**; the UI still shows "not found", so as not to confirm to a stranger
   * that the id is a real order. See docs/specs/20-orders-history.md.
   */
  ORDER_ACCESS_DENIED: "ORDER_ACCESS_DENIED",
  /** 409 from the admin status update. */
  INVALID_ORDER_STATUS_TRANSITION: "INVALID_ORDER_STATUS_TRANSITION",

  // --- payments -------------------------------------------------------------
  /**
   * 404 from `GET /payments/order/{orderId}`. Expected while the order is
   * `PENDING`, and forever on a `REJECTED` one: no payment was ever started.
   */
  PAYMENT_NOT_FOUND: "PAYMENT_NOT_FOUND",
  PAYMENT_ACCESS_DENIED: "PAYMENT_ACCESS_DENIED",
  REFUND_NOT_ALLOWED: "REFUND_NOT_ALLOWED",

  // --- reviews --------------------------------------------------------------
  REVIEW_NOT_FOUND: "REVIEW_NOT_FOUND",
  /** 409 — also when two submissions race past the check (a unique index refuses the second). */
  DUPLICATE_REVIEW: "DUPLICATE_REVIEW",
  REVIEW_ALREADY_DELETED: "REVIEW_ALREADY_DELETED",

  // --- wishlist -------------------------------------------------------------
  WISHLIST_ITEM_NOT_FOUND: "WISHLIST_ITEM_NOT_FOUND",
  WISHLIST_ITEM_ALREADY_EXISTS: "WISHLIST_ITEM_ALREADY_EXISTS",

  // --- gateway --------------------------------------------------------------
  /** 504 — the service behind the gateway did not answer in time (connect 2 s, response 10 s). */
  UPSTREAM_TIMEOUT: "UPSTREAM_TIMEOUT",
  /** 502 — the gateway could not talk to the service at all. */
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",

  // --- server (500) and routing ---------------------------------------------
  INTERNAL_ERROR: "INTERNAL_ERROR",
  /** No route matched, on a public path. */
  NOT_FOUND: "NOT_FOUND",

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
 * Only `TOKEN_EXPIRED`. The error contract is explicit that `TOKEN_INVALID`
 * ends the session — a corrupt or foreign token does not get better with a
 * refresh (docs/specs/21, R1).
 */
const REFRESHABLE_CODES: ReadonlySet<string> = new Set([ErrorCodes.TOKEN_EXPIRED]);

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
