/**
 * Browser-side calls to the BFF's own cart routes.
 *
 * Counterpart of `cart.ts`, which runs on the server and talks to Spring: nothing
 * here ever sees a token. Same split as `auth-client.ts` / `auth.ts`.
 *
 * Deliberately returns copy rather than an error object. Every caller is a small
 * island — a stepper, a card button — whose only job on failure is to show one
 * sentence next to itself, so resolving the `code` to pt-BR here keeps that
 * lookup out of three components. Contrast `applyApiError`, which exists because
 * forms have somewhere per-field to put things; the cart does not.
 */

import { ErrorCodes, type ErrorCode } from "./error-codes";
import { GENERIC_ERROR_MESSAGE, messageForCode } from "./error-messages";
import type { CartViewModel, UUID } from "./types";
import { toErrorBody } from "@/lib/forms/apply-api-error";

const ITEMS_ROUTE = "/api/cart/items";

function itemRoute(bookId: UUID): string {
  return `${ITEMS_ROUTE}/${encodeURIComponent(bookId)}`;
}

export type CartMutationResult =
  | { ok: true; cart: CartViewModel }
  | {
      ok: false;
      code: ErrorCode;
      /** Ready to render — already pt-BR. */
      message: string;
      /**
       * The session died. The component should send the visitor to `/login`
       * rather than show a message: there is nothing they can do in place.
       */
      sessionExpired: boolean;
    };

function failed(code: ErrorCode, sessionExpired = false): CartMutationResult {
  return { ok: false, code, message: messageForCode(code), sessionExpired };
}

async function mutate(
  route: string,
  init: { method: string; body?: unknown },
): Promise<CartMutationResult> {
  let response: Response;
  try {
    response = await fetch(route, {
      method: init.method,
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    // Never reached the BFF — offline, connection dropped.
    return failed(ErrorCodes.NETWORK_ERROR);
  }

  if (response.ok) {
    const cart = (await response.json().catch(() => null)) as CartViewModel | null;
    // A 2xx that does not parse means our own handler broke its contract; treat
    // it as a failure rather than rendering an empty cart over a good one.
    return cart ? { ok: true, cart } : failed(ErrorCodes.INVALID_RESPONSE);
  }

  const body = toErrorBody(await response.json().catch(() => null));
  if (!body) {
    // A crash above the handler, or a proxy answering HTML.
    return {
      ok: false,
      code: ErrorCodes.UNKNOWN,
      message: GENERIC_ERROR_MESSAGE,
      sessionExpired: response.status === 401,
    };
  }

  return failed(body.code, response.status === 401);
}

/**
 * Adds copies of a book — **how many more**, not the new total.
 *
 * Omitting `quantity` means one, which the route handler fills in; the upstream
 * has no default of its own (09-contract-notes.md item 26).
 */
export function addToCart(bookId: UUID, quantity?: number): Promise<CartMutationResult> {
  return mutate(ITEMS_ROUTE, { method: "POST", body: { bookId, quantity } });
}

/** Sets a line to an exact quantity. `0` removes it. */
export function setCartQuantity(bookId: UUID, quantity: number): Promise<CartMutationResult> {
  return mutate(itemRoute(bookId), { method: "PATCH", body: { quantity } });
}

/** Drops a line. Safe to call twice — the upstream is idempotent here. */
export function removeFromCart(bookId: UUID): Promise<CartMutationResult> {
  return mutate(itemRoute(bookId), { method: "DELETE" });
}
