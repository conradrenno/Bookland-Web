/**
 * Cart endpoints — `GET /api/v1/cart` and the three item mutations.
 *
 * Every call needs a bearer token: the upstream derives the cart from the
 * authenticated customer, and there is no cart id in any URL. The token is a
 * parameter rather than something read from cookies here, for the reason given
 * in `client.ts` — importing `next/headers` would confine this module to a
 * request scope and make it untestable from anywhere else.
 *
 * All four resolve to the *whole* updated `CartViewModel`, so a mutation never
 * needs a follow-up `GET`.
 *
 * Covers US-13 — docs/specs/05-cart-checkout.md, docs/specs/18-cart.md.
 */

import { apiFetch } from "./client";
import type { CartViewModel, UUID } from "./types";

const CART_PATH = "/api/v1/cart";
const ITEMS_PATH = `${CART_PATH}/items`;

/** Default when the caller does not say how many — one copy of the book. */
export const DEFAULT_ADD_QUANTITY = 1;

/** Quantity that, sent to `updateCartItem`, deletes the line instead of setting it. */
export const REMOVE_QUANTITY = 0;

function itemPath(bookId: UUID): string {
  return `${ITEMS_PATH}/${encodeURIComponent(bookId)}`;
}

/** The signed-in customer's cart. Always exists — an empty one is created on demand. */
export function getCart(accessToken: string): Promise<CartViewModel> {
  return apiFetch<CartViewModel>(CART_PATH, { accessToken });
}

/**
 * Puts a book in the cart, **adding to** any quantity already there.
 *
 * Verified against the running API (2026-07-29): posting 2 and then 3 of the
 * same book leaves 5, not 3. So the caller must never pre-add the current
 * quantity — that is what `updateCartItem` is for.
 *
 * `quantity` is defaulted here rather than left out, even though the OpenAPI
 * marks it optional: upstream binds it to a primitive `int`, so omitting it (or
 * sending `null`) fails deserialisation with a bare `400 MALFORMED_REQUEST`.
 * Same defect as `stockQuantity` in 09-contract-notes.md item 24.
 */
export function addCartItem(
  accessToken: string,
  bookId: UUID,
  quantity: number = DEFAULT_ADD_QUANTITY,
): Promise<CartViewModel> {
  return apiFetch<CartViewModel>(ITEMS_PATH, {
    method: "POST",
    accessToken,
    body: { bookId, quantity },
  });
}

/**
 * Sets a line to an exact quantity, replacing what was there.
 *
 * `quantity: 0` **removes the line** — the contract's `minimum: 0`, confirmed
 * live. The quantity stepper relies on it: stepping 1 down to 0 deletes the row
 * without needing a separate call.
 */
export function updateCartItem(
  accessToken: string,
  bookId: UUID,
  quantity: number,
): Promise<CartViewModel> {
  return apiFetch<CartViewModel>(itemPath(bookId), {
    method: "PATCH",
    accessToken,
    body: { quantity },
  });
}

/**
 * Drops a line.
 *
 * Idempotent and non-204: removing a book that is not in the cart answers 200
 * with the unchanged cart, so a double-click cannot produce an error. (Unlike
 * `updateCartItem`, which 404s with `BOOK_NOT_IN_CART` in that situation.)
 */
export function removeCartItem(accessToken: string, bookId: UUID): Promise<CartViewModel> {
  return apiFetch<CartViewModel>(itemPath(bookId), {
    method: "DELETE",
    accessToken,
  });
}

/**
 * Total number of books in the cart — the header badge.
 *
 * The sum of quantities, not `items.length`: three copies of one title is a
 * badge reading 3. Accepts `null` so the header can call it whether or not the
 * visitor is signed in.
 */
export function cartItemCount(cart: CartViewModel | null | undefined): number {
  if (!cart) return 0;
  return cart.items.reduce((total, item) => total + item.quantity, 0);
}
