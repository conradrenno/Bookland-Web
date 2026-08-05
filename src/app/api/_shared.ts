/**
 * Helpers shared by every BFF route handler.
 *
 * Underscore-prefixed so the App Router does not treat this folder as a route
 * segment. Lived under `api/auth/` until the cart routes needed the same three
 * pieces (stage 5a).
 */

import { NextResponse } from "next/server";

import { ErrorCodes } from "@/lib/api/error-codes";
import { isApiError } from "@/lib/api/errors";
import { isUuid } from "@/lib/api/uuid";
import { PAYMENT_METHODS, type PaymentMethod, type UUID } from "@/lib/api/types";

/**
 * Translates a failure into the response the browser sees.
 *
 * Upstream `ApiError`s are forwarded with their status and `code` so the caller
 * can branch — a 409 `CART_ITEM_UNAVAILABLE` has to stay distinguishable from a
 * 404. Anything else is a bug on our side and collapses into a generic 500;
 * leaking a stack trace to the browser would be worse than an unhelpful message.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (isApiError(error)) {
    return NextResponse.json(error.toResponseBody(), { status: error.status || 502 });
  }

  console.error("[bff] unexpected failure", error);
  return NextResponse.json(
    { code: ErrorCodes.UNKNOWN, message: "Não foi possível concluir a operação." },
    { status: 500 },
  );
}

/** Reads and shallowly validates a JSON body, rejecting a malformed one early. */
export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function malformedBody(message = "Corpo da requisição inválido."): NextResponse {
  return NextResponse.json({ code: ErrorCodes.MALFORMED_REQUEST, message }, { status: 400 });
}

/**
 * The answer when there is no session cookie at all.
 *
 * A **401 body**, not a redirect: these routes are reached by `fetch`, which
 * follows redirects transparently and would hand the caller a 200 carrying the
 * login page's HTML. That is also why `/api/cart` is deliberately absent from
 * `PROTECTED_PREFIXES` — the middleware still renews an expiring token on the
 * way through, but the bouncing is this layer's job. See docs/specs/02-auth.md.
 */
export function unauthenticated(): NextResponse {
  return NextResponse.json(
    { code: ErrorCodes.TOKEN_MISSING, message: "Faça login para continuar." },
    { status: 401 },
  );
}

/**
 * Validates a path segment that must be a book id.
 *
 * Refused here rather than forwarded because the upstream answers a bare
 * `400 MALFORMED_REQUEST` to a non-UUID, naming no field — the same reasoning as
 * `parseBookSearchParams`: junk we can recognise gets our own message.
 */
export function invalidBookId(): NextResponse {
  return NextResponse.json(
    { code: ErrorCodes.INVALID_PARAMETER, message: "Livro inválido." },
    { status: 400 },
  );
}

export function isValidBookId(value: unknown): value is UUID {
  return typeof value === "string" && isUuid(value);
}

/**
 * Same check, different noun.
 *
 * Kept as its own pair rather than a generic `invalidId(label)` because the
 * message is the whole point: "Livro inválido" and "Pedido inválido" are what
 * the customer reads, and threading a label through would make the call sites
 * less obvious than the duplication saves.
 *
 * Upstream *does* name the field here — `400 INVALID_PARAMETER` with
 * `errors.orderId: ["must be a valid UUID"]` — but it is still refused locally:
 * a round trip to learn what `isUuid` already knows is a round trip wasted.
 */
export function isValidOrderId(value: unknown): value is UUID {
  return typeof value === "string" && isUuid(value);
}

export function invalidOrderId(): NextResponse {
  return NextResponse.json(
    { code: ErrorCodes.INVALID_PARAMETER, message: "Pedido inválido." },
    { status: 400 },
  );
}

/**
 * Whether a value is a usable quantity: a whole number at or above `min`.
 *
 * `Number.isInteger` rather than a `typeof` check on purpose — JSON happily
 * carries `2.5`, `NaN` and `Infinity`, and upstream binds this to a Java `int`.
 */
export function isValidQuantity(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min;
}

export function invalidQuantity(): NextResponse {
  return NextResponse.json(
    { code: ErrorCodes.VALIDATION_ERROR, message: "Quantidade inválida." },
    { status: 400 },
  );
}

/**
 * Whether a value is one of the four payment methods.
 *
 * Checked here because the upstream has *two* different answers for a bad one
 * and neither is usable: a missing field is `400 VALIDATION_ERROR`, while a
 * value outside the enum breaks deserialisation and comes back as a bare
 * `400 MALFORMED_REQUEST` naming no field (09-contract-notes.md item 27). The
 * value always comes from our own picker, so neither should ever be reachable.
 */
export function isValidPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}

export function invalidPaymentMethod(): NextResponse {
  return NextResponse.json(
    { code: ErrorCodes.VALIDATION_ERROR, message: "Forma de pagamento inválida." },
    { status: 400 },
  );
}
