import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The cart with nothing in it.
 *
 * Deliberately not an error or a warning: an empty cart is the normal state of a
 * new customer, so it reads as an invitation and its only action is the way back
 * to the catalogue (docs/specs/18-cart.md).
 */
export function EmptyCart() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <ShoppingBag aria-hidden className="size-8 text-muted-foreground" />
      <h2 className="font-serif text-xl">Seu carrinho está vazio</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Escolha um livro no catálogo e ele aparece aqui.
      </p>
      {/* Styled link rather than a `Button` rendering one — it navigates, so it
          must read as a link (docs/specs/18-cart.md). */}
      <Link href="/" className={cn(buttonVariants({ size: "lg" }), "mt-2")}>
        Ver o catálogo
      </Link>
    </div>
  );
}
