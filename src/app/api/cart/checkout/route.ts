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
 * US-14 — turns the cart into an order.
 *
 * The one mutation in the app that spends money, and the shortest handler of the
 * lot: `paymentMethod` is the entire payload the API accepts. Anything the
 * checkout page collects beyond it is decorative and stops at the browser
 * (docs/specs/19-checkout.md).
 *
 * The response is the created order, already `CONFIRMED` and paid — the caller
 * navigates to it. Failures ride `toErrorResponse`, which keeps `status` and
 * `code` intact so the form can tell "carrinho vazio" (404 `CART_NOT_FOUND`)
 * from "acabou o estoque" (409 `CART_ITEM_UNAVAILABLE`); both send the customer
 * back to the cart, but for different reasons.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = await getAccessToken();
  if (!token) return unauthenticated();

  const body = await readJsonBody<CheckoutBody>(request);
  if (!body) return malformedBody();
  if (!isValidPaymentMethod(body.paymentMethod)) return invalidPaymentMethod();

  try {
    return NextResponse.json(await checkout(token, body.paymentMethod));
  } catch (error) {
    return toErrorResponse(error);
  }
}
