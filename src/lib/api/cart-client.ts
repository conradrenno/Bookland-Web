/**
 * Browser-side calls to the BFF's own cart routes.
 *
 * Counterpart of `cart.ts`, which runs on the server and talks to Spring: nothing
 * here ever sees a token. Same split as `auth-client.ts` / `auth.ts`.
 *
 * The `fetch`-and-normalise part lives in `bff-mutate.ts`, shared with the
 * checkout; what stays here is the vocabulary of the cart — the three routes and
 * what each one means.
 */

import { bffMutate, type BffResult } from "./bff-mutate";
import type { CartViewModel, UUID } from "./types";

const ITEMS_ROUTE = "/api/cart/items";

function itemRoute(bookId: UUID): string {
  return `${ITEMS_ROUTE}/${encodeURIComponent(bookId)}`;
}

/** Every cart mutation answers the whole updated cart, or copy explaining why not. */
export type CartMutationResult = BffResult<CartViewModel>;

/**
 * Adds copies of a book — **how many more**, not the new total.
 *
 * Omitting `quantity` means one, which the route handler fills in; the upstream
 * has no default of its own (09-contract-notes.md item 26).
 */
export function addToCart(bookId: UUID, quantity?: number): Promise<CartMutationResult> {
  return bffMutate<CartViewModel>(ITEMS_ROUTE, {
    method: "POST",
    body: { bookId, quantity },
  });
}

/** Sets a line to an exact quantity. `0` removes it. */
export function setCartQuantity(bookId: UUID, quantity: number): Promise<CartMutationResult> {
  return bffMutate<CartViewModel>(itemRoute(bookId), { method: "PATCH", body: { quantity } });
}

/** Drops a line. Safe to call twice — the upstream is idempotent here. */
export function removeFromCart(bookId: UUID): Promise<CartMutationResult> {
  return bffMutate<CartViewModel>(itemRoute(bookId), { method: "DELETE" });
}
