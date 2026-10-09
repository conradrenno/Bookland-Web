"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { QuantityStepper } from "@/components/cart/quantity-stepper";
import { BookCover } from "@/components/catalog/book-cover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  removeFromCart,
  setCartQuantity,
  type CartMutationResult,
} from "@/lib/api/cart-client";
import type { CartItemViewModel } from "@/lib/api/types";
import { loginHref } from "@/lib/auth/next-path";
import { navigateTo } from "@/lib/navigation";
import { formatPrice } from "@/lib/format";

/** The thumbnail is a fixed 5rem wide, so the optimiser needs no breakpoint list. */
const LINE_COVER_SIZES = "80px";

/**
 * One line of the cart: cover, title, quantity, subtotal (docs/specs/18-cart.md).
 *
 * The client boundary of the page — everything else in `/cart` is server
 * rendered. It holds no cart state: a successful mutation ends in
 * `router.refresh()` and the server sends the new numbers down. That is why the
 * whole row dims while a request is in flight instead of moving the quantity
 * optimistically — showing "3" next to a subtotal for two would be worse than
 * waiting.
 *
 * Errors land **here**, next to the book they are about. A banner at the top of
 * a five-line cart cannot say which line failed.
 */
export function CartLine({ item }: { item: CartItemViewModel }) {
  const router = useRouter();
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // `isRefreshing` stays true until the server render lands, so the controls
  // remain locked through the round-trip rather than unlocking on stale numbers.
  const [isRefreshing, startTransition] = useTransition();
  const busy = sending || isRefreshing;

  async function run(mutation: () => Promise<CartMutationResult>) {
    // Belt and braces: the buttons are disabled while busy, but a keyboard
    // repeat can fire before React re-renders them.
    if (busy) return;

    setSending(true);
    setError(null);
    const result = await mutation();
    setSending(false);

    if (result.ok) {
      startTransition(() => router.refresh());
      return;
    }

    if (result.sessionExpired) {
      // Nothing they can do in place — and `/cart` itself now needs a session.
      navigateTo(loginHref(pathname));
      return;
    }

    setError(result.message);
  }

  return (
    <li
      aria-busy={busy || undefined}
      className={`flex gap-4 py-5 transition-opacity ${busy ? "opacity-60" : ""}`}
    >
      <Link href={`/books/${item.bookId}`} className="w-16 shrink-0 sm:w-20" tabIndex={-1}>
        <BookCover
          coverImageUrl={item.coverImageUrl}
          title={item.title}
          sizes={LINE_COVER_SIZES}
          fit="contain"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="font-serif text-base leading-snug">
              <Link href={`/books/${item.bookId}`} className="hover:text-primary">
                {item.title}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">
              {formatPrice(item.unitPrice)} <span className="text-xs">cada</span>
            </p>
            {!item.available && (
              // Stock can run out while the book sits in the cart. Saying so here
              // is the only warning before the checkout refuses it (stage 5b).
              <Badge variant="outline" className="text-destructive">
                Indisponível
              </Badge>
            )}
          </div>

          {/* One click to drop the whole line. The stepper can also get there,
              but only one copy at a time — three clicks and three round-trips
              for a line of three. `DELETE` is idempotent, so a double fire is
              harmless (docs/specs/09-contract-notes.md item 26). */}
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={`Remover ${item.title} do carrinho`}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => run(() => removeFromCart(item.bookId))}
          >
            <X aria-hidden />
          </Button>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <QuantityStepper
            quantity={item.quantity}
            busy={busy}
            canIncrease={item.available}
            itemLabel={item.title}
            onChange={(quantity) => run(() => setCartQuantity(item.bookId, quantity))}
          />
          <p className="font-semibold text-primary">{formatPrice(item.subtotal)}</p>
        </div>

        {error && (
          <p role="alert" className="text-xs leading-snug text-destructive">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
