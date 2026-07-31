/**
 * The payment behind an order — `GET /api/v1/payments/order/{orderId}`.
 *
 * Read-only from the storefront's point of view: payment happens inside the
 * checkout call, and refunds are an admin route. This exists for one reason —
 * `OrderViewModel` carries **no `paymentMethod`**, so without this lookup the
 * order page cannot tell the customer how they paid, a minute after they chose.
 *
 * The endpoint is authenticated rather than admin-only (backend README), which
 * is what makes that possible.
 */

import { apiFetch } from "./client";
import type { PaymentViewModel, UUID } from "./types";

const PAYMENTS_PATH = "/api/v1/payments/order";

/** The payment record for an order. */
export function getOrderPayment(
  accessToken: string,
  orderId: UUID,
): Promise<PaymentViewModel> {
  return apiFetch<PaymentViewModel>(`${PAYMENTS_PATH}/${encodeURIComponent(orderId)}`, {
    accessToken,
  });
}
