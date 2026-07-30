import type { Metadata } from "next";
import { redirect } from "next/navigation";

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
  const cart = await loadCart();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Finalizar compra</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Confira o pedido e escolha como pagar.
        </p>
      </header>

      {/* The form leads on a narrow screen — the summary is a check, not the
          task. On a wide one they sit side by side, summary sticky. */}
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-10">
        <CheckoutForm total={cart.total} />

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <OrderReview items={cart.items} total={cart.total} />
        </aside>
      </div>
    </div>
  );
}

/**
 * The cart, or a bounce to wherever the customer actually belongs.
 *
 * An empty cart never reaches the form: the upstream answers `404
 * CART_NOT_FOUND` to a checkout without items (verified 2026-07-30), and asking
 * someone to confirm nothing is a dead end anyway. The cart page explains the
 * emptiness far better than this one could.
 */
async function loadCart(): Promise<CartViewModel> {
  try {
    const cart = await getCurrentCart();
    if (!cart) redirect(SIGN_IN_PATH);
    if (cart.items.length === 0) redirect("/cart");
    return cart;
  } catch (error) {
    // `isSessionProblem` rather than a bare 401: Spring's `/error` dispatch can
    // wear a 401 over a crash, and that must not look like an expired session.
    // `redirect()` throws, so anything unrecognised is rethrown untouched.
    if (isApiError(error) && error.isSessionProblem) redirect(SIGN_IN_PATH);
    throw error;
  }
}
