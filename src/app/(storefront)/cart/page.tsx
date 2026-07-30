import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CartLine } from "@/components/cart/cart-line";
import { CartSummary } from "@/components/cart/cart-summary";
import { EmptyCart } from "@/components/cart/empty-cart";
import { cartItemCount } from "@/lib/api/cart";
import { isApiError } from "@/lib/api/errors";
import type { CartViewModel } from "@/lib/api/types";
import { getCurrentCart } from "@/lib/cart/current-cart";

/** Where an unusable session is sent — the same target the header's icon uses. */
const SIGN_IN_PATH = "/login?next=%2Fcart";

export const metadata: Metadata = {
  title: "Carrinho",
  // Nothing here belongs in an index: it is one customer's private cart.
  robots: { index: false, follow: false },
};

/**
 * US-13 — the cart.
 *
 * A Server Component that renders the cart the API returns, with a client island
 * per line for the mutations. There is no cart in browser state at all: every
 * change ends in `router.refresh()` and the numbers come back down from here,
 * which is also what keeps the header badge honest (docs/specs/18-cart.md).
 */
export default async function CartPage() {
  const cart = await loadCart();
  const itemCount = cartItemCount(cart);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Carrinho</h1>
        {itemCount > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {itemCount === 1 ? "1 item no carrinho" : `${itemCount} itens no carrinho`}
          </p>
        )}
      </header>

      {cart.items.length === 0 ? (
        <EmptyCart />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-10">
          <ul className="divide-y divide-border border-y border-border">
            {cart.items.map((item) => (
              <CartLine key={item.bookId} item={item} />
            ))}
          </ul>

          {/* Sticky on a wide screen so the total stays in view down a long
              cart; on a narrow one it simply follows the list. */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <CartSummary
              total={cart.total}
              itemCount={itemCount}
              hasUnavailableItem={cart.items.some((item) => !item.available)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * The cart, or a bounce to sign-in.
 *
 * `/cart` is in `PROTECTED_PREFIXES`, so the middleware normally turns anonymous
 * visitors away before this runs. The two cases below are the gap it cannot
 * close: a cookie that exists but no longer decodes, and a token that expires
 * between the middleware and this render. Both mean "sign in again", not "the
 * store is broken", so neither should reach `error.tsx`.
 */
async function loadCart(): Promise<CartViewModel> {
  try {
    const cart = await getCurrentCart();
    if (!cart) redirect(SIGN_IN_PATH);
    return cart;
  } catch (error) {
    // `isSessionProblem`, not a bare 401: Spring's `/error` dispatch can wear a
    // 401 while actually being a crash, and bouncing someone to the login page
    // over a server fault would hide the real failure.
    //
    // `redirect()` works by throwing; rethrowing anything we do not recognise
    // keeps it — and any genuine upstream failure — travelling upwards.
    if (isApiError(error) && error.isSessionProblem) redirect(SIGN_IN_PATH);
    throw error;
  }
}
