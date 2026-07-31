import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmptyCart } from "@/components/cart/empty-cart";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { OrderReview } from "@/components/checkout/order-review";
import { isApiError } from "@/lib/api/errors";
import type { CartViewModel } from "@/lib/api/types";
import { getCurrentCart } from "@/lib/cart/current-cart";

/** Where an unusable session is sent. */
const SIGN_IN_PATH = "/login?next=%2Fcheckout";

export const metadata: Metadata = {
  title: "Finalizar compra",
  // One customer's pending purchase — nothing for an index to hold.
  robots: { index: false, follow: false },
};

/**
 * US-14 — the confirmation step.
 *
 * A Server Component that reads the cart and hands the numbers to one client
 * island. There is no payment step after this: the upstream charges inside the
 * checkout call and answers with an order that is already `CONFIRMED`
 * (docs/specs/19-checkout.md).
 */
export default async function CheckoutPage() {
  const cart = await readCart();

  // Called from here rather than from inside `readCart`'s `try`, which is what
  // Next asks for — `redirect()` works by throwing. Rare in practice: the
  // middleware turns anonymous visitors away with a real 307 long before this.
  if (cart === "no-session") redirect(SIGN_IN_PATH);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Finalizar compra</h1>
        {cart !== "empty" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Confira o pedido e escolha como pagar.
          </p>
        )}
      </header>

      {/*
        An empty cart is **answered here, not redirected**.

        Sending it to `/cart` was the first plan, and it works — but a Server
        Component's `redirect()` on this version answers 200 with a one-second
        `<meta refresh>` rather than a 3xx, so the visitor watches a blank page
        before arriving. Measured in the production build on 2026-07-30, same as
        the soft `notFound()` already on record (CONTEXT.md).

        Rendering the empty state costs nothing and is instant. Reaching this at
        all means an empty cart plus a direct link, since the cart's own CTA
        disappears when there is nothing to buy.
      */}
      {cart === "empty" ? (
        <EmptyCart />
      ) : (
        // The form leads on a narrow screen — the summary is a check, not the
        // task. On a wide one they sit side by side, summary sticky.
        <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-10">
          <CheckoutForm total={cart.total} />

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <OrderReview items={cart.items} total={cart.total} />
          </aside>
        </div>
      )}
    </div>
  );
}

/** Why the page cannot be rendered, when it cannot — never a thrown redirect. */
type CartOutcome = CartViewModel | "no-session" | "empty";

/**
 * The cart, or a word for what is missing.
 *
 * Returns rather than redirects so the caller can bounce from the top of the
 * component — see the note there. Genuine upstream failures still throw, and
 * reach `error.tsx`.
 */
async function readCart(): Promise<CartOutcome> {
  try {
    const cart = await getCurrentCart();
    if (!cart) return "no-session";
    return cart.items.length === 0 ? "empty" : cart;
  } catch (error) {
    // `isSessionProblem` rather than a bare 401: Spring's `/error` dispatch can
    // wear a 401 over a crash, and that must not look like an expired session.
    if (isApiError(error) && error.isSessionProblem) return "no-session";
    throw error;
  }
}
