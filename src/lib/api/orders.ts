/**
 * Checkout and order reads — `POST /api/v1/cart/checkout` and `GET /orders/{id}`.
 *
 * Same shape as `cart.ts`: the token is a parameter rather than something read
 * from cookies here, so the module stays testable outside a request scope.
 *
 * Covers US-14 and US-18 — docs/specs/19-checkout.md.
 */

import { apiFetch } from "./client";
import type { OrderViewModel, PaymentMethod, UUID } from "./types";

const CHECKOUT_PATH = "/api/v1/cart/checkout";
const ORDERS_PATH = "/api/v1/orders";

/**
 * Turns the cart into an order — and, in this backend, **pays for it**.
 *
 * Verified live (2026-07-30): the response comes back `CONFIRMED`, with the
 * `AWAITING_PAYMENT → CONFIRMED` transition already in `statusHistory` and the
 * payment approved by a simulated gateway. There is no second step to call, and
 * no payment data to send: `paymentMethod` is the only field the API accepts.
 *
 * Two failures are worth knowing about, both handled by the caller rather than
 * here (09-contract-notes.md item 27):
 *
 * - **404 `CART_NOT_FOUND`** — the cart is empty. Not a 409, and it answers this
 *   even for a cart that exists with no items.
 * - **409 `CART_ITEM_UNAVAILABLE`** — stock ran out between adding and
 *   confirming. The offending book ids appear only inside the English `detail`,
 *   so nothing structured can be extracted; `GET /cart` flags the line instead.
 */
export function checkout(
  accessToken: string,
  paymentMethod: PaymentMethod,
): Promise<OrderViewModel> {
  return apiFetch<OrderViewModel>(CHECKOUT_PATH, {
    method: "POST",
    accessToken,
    body: { paymentMethod },
  });
}

/**
 * One order, with its items, totals and status history.
 *
 * Prices, titles and covers are frozen at checkout time, so what comes back is
 * what the customer bought — not what the catalogue says today.
 *
 * A missing order answers `404 ORDER_NOT_FOUND`. Someone else's order has not
 * been measured yet (it needs a second account); the page treats both as "not
 * found", which is also the right answer if it turns out to be a 403.
 */
export function getOrder(accessToken: string, orderId: UUID): Promise<OrderViewModel> {
  return apiFetch<OrderViewModel>(`${ORDERS_PATH}/${encodeURIComponent(orderId)}`, {
    accessToken,
  });
}
