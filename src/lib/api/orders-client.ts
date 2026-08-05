/**
 * Browser-side calls to the BFF's own order routes.
 *
 * Counterpart of `orders.ts`, which runs on the server and talks to Spring:
 * nothing here ever sees a token. Same split as `cart-client.ts` / `cart.ts`.
 *
 * Only the mutation lives here. Reading orders is server work — `/orders` and
 * `/orders/[orderId]` render on the server and need no browser fetch.
 */

import { bffMutate, type BffResult } from "./bff-mutate";
import type { OrderViewModel, UUID } from "./types";

const ORDERS_ROUTE = "/api/orders";

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
