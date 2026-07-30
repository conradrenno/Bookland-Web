/**
 * The signed-in visitor's cart, read during a server render.
 *
 * Sits between `lib/api/cart.ts` (pure, token in, no `next/headers`) and the
 * components: this is the only place that turns a cookie into a cart.
 *
 * Wrapped in React's `cache()` because on `/cart` two independent Server
 * Components ask for the same thing in the same render — the page itself and the
 * header badge, which lives in the root layout. Without the memo that is two
 * `GET /api/v1/cart` per pageview (docs/specs/18-cart.md).
 */

import { cache } from "react";

import { cartItemCount, getCart } from "@/lib/api/cart";
import type { CartViewModel } from "@/lib/api/types";
import { getAccessToken } from "@/lib/auth/server";

/**
 * The cart, or `null` when nobody is signed in.
 *
 * Upstream failures **throw**: on `/cart` the cart is the page, so a silent
 * empty state would be a lie. The header wants the opposite trade-off and uses
 * `safeCartItemCount` below.
 */
export const getCurrentCart = cache(async (): Promise<CartViewModel | null> => {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  return getCart(accessToken);
});

/**
 * How many books the badge should show — `0` whenever anything went wrong.
 *
 * The header is rendered by the root layout, and a layout that throws takes the
 * whole site down, error page included. Same precedent as `safeCategories`: a
 * badge that is briefly missing beats a blank site (docs/specs/13-common_header.md).
 */
export async function safeCartItemCount(): Promise<number> {
  try {
    return cartItemCount(await getCurrentCart());
  } catch {
    return 0;
  }
}
