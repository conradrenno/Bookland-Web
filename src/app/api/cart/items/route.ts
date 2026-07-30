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
import { addCartItem, DEFAULT_ADD_QUANTITY } from "@/lib/api/cart";
import { getAccessToken } from "@/lib/auth/server";

interface AddItemBody {
  bookId?: unknown;
  quantity?: unknown;
}

/**
 * US-13 — puts a book in the cart.
 *
 * Answers the whole updated cart, which is what lets the caller re-render the
 * badge without a follow-up `GET`.
 *
 * Note the upstream semantics this inherits: the quantity is **added to** what
 * is already on the line, never substituted for it (09-contract-notes.md item
 * 26). Callers send "how many more".
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = await getAccessToken();
  if (!token) return unauthenticated();

  const body = await readJsonBody<AddItemBody>(request);
  if (!body) return malformedBody();
  if (!isValidBookId(body.bookId)) return invalidBookId();

  // Absent is legitimate and means one copy; present-but-nonsense is not. The
  // upstream cannot make this distinction — it has no default at all — so the
  // default lives here.
  const quantity = body.quantity ?? DEFAULT_ADD_QUANTITY;
  if (!isValidQuantity(quantity, 1)) return invalidQuantity();

  try {
    return NextResponse.json(await addCartItem(token, body.bookId, quantity));
  } catch (error) {
    return toErrorResponse(error);
  }
}
