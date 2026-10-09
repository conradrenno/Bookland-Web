/**
 * Browser-side calls to the BFF's own order routes.
 *
 * Counterpart of `orders.ts`, which runs on the server and talks to the API:
 * nothing here ever sees a token. Same split as `cart-client.ts` / `cart.ts`.
 *
 * Reading orders is server work, with one exception: an order whose checkout
 * is still running is polled from the browser until its status moves
 * (docs/specs/21, stage 4).
 */

import { bffMutate, type BffResult } from "./bff-mutate";
import type { OrderViewModel, UUID } from "./types";

const ORDERS_ROUTE = "/api/orders";

/** The order as it stands now, for the page that waits on a checkout. */
export function readOrder(orderId: UUID): Promise<BffResult<OrderViewModel>> {
  return bffMutate<OrderViewModel>(`${ORDERS_ROUTE}/${encodeURIComponent(orderId)}`, {
    method: "GET",
  });
}

/** Cancelling answers the whole updated order, or copy explaining why not. */
export type CancelOrderResult = BffResult<OrderViewModel>;

/**
 * Cancels an order — the storefront's one destructive action.
 *
 * **Not idempotent**, unlike `removeFromCart`: a second call answers 409
 * `ORDER_CANCELLATION_NOT_ALLOWED`, which `bffMutate` turns into "Este pedido
 * não pode mais ser cancelado." That is a fair message for someone who really
 * did click twice slowly, but the button still guards against the fast double
 * click, because the honest answer there is nothing at all.
 */
export function cancelOrder(orderId: UUID): Promise<CancelOrderResult> {
  return bffMutate<OrderViewModel>(`${ORDERS_ROUTE}/${encodeURIComponent(orderId)}`, {
    method: "DELETE",
  });
}
