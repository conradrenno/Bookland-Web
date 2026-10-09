import { NextResponse } from "next/server";

import {
  invalidPaymentMethod,
  isValidPaymentMethod,
  malformedBody,
  readJsonBody,
  toErrorResponse,
  unauthenticated,
} from "@/app/api/_shared";
import { checkout } from "@/lib/api/orders";
import { getAccessToken } from "@/lib/auth/server";

interface CheckoutBody {
  paymentMethod?: unknown;
}

/**
 * US-14 — starts turning the cart into an order.
 *
 * The one mutation in the app that spends money, and the shortest handler of the
 * lot: `paymentMethod` is the entire payload the API accepts. Anything the
 * checkout page collects beyond it is decorative and stops at the browser
 * (docs/specs/19-checkout.md).
 *
 * Passes the upstream's **202** through with the order `PENDING`: the checkout
 * has started, not finished. The caller navigates to the order, whose page
 * follows it to its outcome (docs/specs/21). Failures ride `toErrorResponse`,
 * which keeps `status` and `code` intact so the form can tell "carrinho vazio"
 * (409 `CART_EMPTY`) from "acabou o estoque" (409 `CART_ITEM_UNAVAILABLE`) from
 * "já tem um pedido em andamento" (409 `CHECKOUT_IN_PROGRESS`).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = await getAccessToken();
  if (!token) return unauthenticated();

  const body = await readJsonBody<CheckoutBody>(request);
  if (!body) return malformedBody();
  if (!isValidPaymentMethod(body.paymentMethod)) return invalidPaymentMethod();

  try {
    return NextResponse.json(await checkout(token, body.paymentMethod), { status: 202 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
