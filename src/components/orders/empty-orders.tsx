import { Package } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The history with nothing in it.
 *
 * Same posture as `EmptyCart`: not an error, just where every customer starts,
 * so it reads as an invitation and its only action is the way to the catalogue.
 *
 * Doubles as the answer to `?page=99`, which the upstream serves as an empty
 * page rather than a 404 (09-contract-notes.md item 28). Someone who hand-edits
 * the page number lands on "nenhum pedido aqui" instead of an error screen —
 * and the pager never generates that link in the first place.
 */
export function EmptyOrders() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <Package aria-hidden className="size-8 text-muted-foreground" />
      <h2 className="font-serif text-xl">Você ainda não fez pedidos</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Quando você comprar, seus pedidos aparecem aqui com o status de cada um.
      </p>
      {/* Styled link rather than a `Button` rendering one — it navigates, so it
          must read as a link (docs/specs/18-cart.md). */}
      <Link href="/" className={cn(buttonVariants({ size: "lg" }), "mt-2")}>
        Ver o catálogo
      </Link>
    </div>
  );
}
