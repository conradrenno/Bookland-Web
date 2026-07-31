import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CartSummaryProps {
  /** Comes from the API — never re-added here, so our arithmetic cannot disagree with the order. */
  total: number;
  /** Sum of the quantities, for the "N itens" line. */
  itemCount: number;
  /** True when some line went out of stock: the checkout would refuse the order. */
  hasUnavailableItem?: boolean;
}

/**
 * Total and the way out of the cart (docs/specs/18-cart.md).
 *
 * The CTA led nowhere through stage 5a — `/checkout` did not exist yet, and a
 * button that 404s is worse than one that says "soon". It exists now, so this is
 * a link (docs/specs/19-checkout.md).
 *
 * It still goes dead when a line is out of stock: the checkout would be refused
 * upstream with a 409, and bouncing someone off a payment page teaches them
 * nothing the cart cannot say here.
 */
export function CartSummary({ total, itemCount, hasUnavailableItem }: CartSummaryProps) {
  return (
    <section
      aria-labelledby="cart-summary-heading"
      className="rounded-lg border border-border bg-card p-5"
    >
      <h2 id="cart-summary-heading" className="font-serif text-lg">
        Resumo
      </h2>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            {itemCount === 1 ? "1 item" : `${itemCount} itens`}
          </dt>
          <dd className="tabular-nums">{formatPrice(total)}</dd>
        </div>
        {/* No shipping or discount line: the API has neither field, and inventing
            a "Frete: grátis" row would be putting a number on the screen that
            nothing behind it supports (docs/specs/09-contract-notes.md item 10). */}
      </dl>

      <Separator className="my-4" />

      <div className="flex items-baseline justify-between">
        <span className="font-medium">Total</span>
        <span className="text-xl font-semibold text-primary tabular-nums">
          {formatPrice(total)}
        </span>
      </div>

      {hasUnavailableItem ? (
        // A `<button disabled>` rather than a dimmed link: a disabled link is
        // still followable by keyboard and by right-click, and this one must not
        // be followed.
        <Button size="lg" className="mt-5 w-full" disabled>
          Finalizar compra
        </Button>
      ) : (
        <Link href="/checkout" className={cn(buttonVariants({ size: "lg" }), "mt-5 w-full")}>
          Finalizar compra
        </Link>
      )}

      {hasUnavailableItem && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Remova os itens indisponíveis para continuar.
        </p>
      )}

      <Link
        href="/"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-3 w-full")}
      >
        Continuar comprando
      </Link>
    </section>
  );
}
