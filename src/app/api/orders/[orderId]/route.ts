import { NextResponse } from "next/server";

import { invalidOrderId, isValidOrderId, toErrorResponse, unauthenticated } from "@/app/api/_shared";
import { cancelOrder } from "@/lib/api/orders";
import { getAccessToken } from "@/lib/auth/server";

/** Next 15+ hands dynamic segments in as a promise. */
type RouteContext = { params: Promise<{ orderId: string }> };

/**
 * US-16 — cancels an order.
 *
 * The one destructive mutation in the storefront: upstream restores stock and
 * refunds the payment, which is why the page puts a confirmation dialog in front
 * of it (docs/specs/20-orders-history.md).
 *
 * There is no body to read — the id in the path is the whole request. The
 * response is the **updated order**, not an empty 204, so the caller could
 * render it directly; the page instead calls `router.refresh()`, because the
 * status timeline and the payment panel around it have to move too.
 *
 * Failures ride `toErrorResponse` with `status` and `code` intact, which is what
 * lets the browser tell "já foi cancelado" (409
 * `ORDER_CANCELLATION_NOT_ALLOWED`) from "não é seu" (403
 * `ORDER_ACCESS_DENIED`). The first is reachable by an ordinary double click;
 * the second only by typing an id.
 */
export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const token = await getAccessToken();
  if (!token) return unauthenticated();

  const { orderId } = await context.params;
  if (!isValidOrderId(orderId)) return invalidOrderId();

  try {
    return NextResponse.json(await cancelOrder(token, orderId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
