import { NextResponse } from "next/server";

import {
  invalidBookId,
  invalidQuantity,
  isValidBookId,
  isValidQuantity,
  malformedBody,
  readJsonBody,
  toErrorResponse,
  unauthenticated,
} from "@/app/api/_shared";
import { removeCartItem, updateCartItem } from "@/lib/api/cart";
import { getAccessToken } from "@/lib/auth/server";

/** Next 15+ hands dynamic segments in as a promise. */
type RouteContext = { params: Promise<{ bookId: string }> };

interface UpdateItemBody {
  quantity?: unknown;
}

/**
 * US-13 — sets a line to an exact quantity.
 *
 * `quantity: 0` is a **removal**, per the contract's `minimum: 0` and confirmed
 * live — which is why the floor below is 0 and not 1. The stepper depends on it.
 */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const token = await getAccessToken();
  if (!token) return unauthenticated();

  const { bookId } = await context.params;
  if (!isValidBookId(bookId)) return invalidBookId();

  const body = await readJsonBody<UpdateItemBody>(request);
  if (!body) return malformedBody();
  if (!isValidQuantity(body.quantity, 0)) return invalidQuantity();

  try {
    return NextResponse.json(await updateCartItem(token, bookId, body.quantity));
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * US-13 — drops a line.
 *
 * Idempotent upstream: removing something already gone answers the unchanged
 * cart rather than a 404, so a double-click is harmless. (`PATCH` on a missing
 * line is *not* — it 404s with `BOOK_NOT_IN_CART`.)
 */
export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  const token = await getAccessToken();
  if (!token) return unauthenticated();

  const { bookId } = await context.params;
  if (!isValidBookId(bookId)) return invalidBookId();

  try {
    return NextResponse.json(await removeCartItem(token, bookId));
  } catch (error) {
    return toErrorResponse(error);
  }
}
