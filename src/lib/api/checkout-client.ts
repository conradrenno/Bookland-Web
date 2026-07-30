/**
 * Browser-side call to the BFF's checkout route.
 *
 * One function, and it is the most consequential mutation in the app: it spends
 * the customer's money. Everything else about it lives elsewhere — `bff-mutate`
 * normalises the response, and `app/api/cart/checkout/route.ts` holds the token.
 */

import { bffMutate, type BffResult } from "./bff-mutate";
import type { OrderViewModel, PaymentMethod } from "./types";

const CHECKOUT_ROUTE = "/api/cart/checkout";

/** Success carries the created order, whose id is where the customer goes next. */
export type CheckoutResult = BffResult<OrderViewModel>;

/**
 * Confirms the order.
 *
 * **`paymentMethod` is the entire payload.** The card and PIX fields on the
 * checkout page are decorative — the API has nowhere to put them, and nothing
 * typed there is allowed to leave the browser (docs/specs/19-checkout.md).
 */
export function submitCheckout(paymentMethod: PaymentMethod): Promise<CheckoutResult> {
  return bffMutate<OrderViewModel>(CHECKOUT_ROUTE, {
    method: "POST",
    body: { paymentMethod },
  });
}
