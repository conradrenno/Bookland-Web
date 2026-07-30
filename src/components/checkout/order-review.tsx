import Link from "next/link";

import { BookCover } from "@/components/catalog/book-cover";
import { Separator } from "@/components/ui/separator";
import type { CartItemViewModel } from "@/lib/api/types";
import { formatPrice } from "@/lib/format";

const THUMB_SIZES = "56px";

interface OrderReviewProps {
  items: CartItemViewModel[];
  total: number;
}

/**
 * What is about to be bought — read-only on purpose.
 *
 * No steppers and no remove buttons: this is the confirmation step, and a
 * control here would invite editing the cart from a page whose job is to close
 * it. The way back is the link at the bottom (docs/specs/19-checkout.md).
 */
export function OrderReview({ items, total }: OrderReviewProps) {
  return (
    <section
      aria-labelledby="order-review-heading"
      className="rounded-lg border border-border bg-card p-5"
    >
      <h2 id="order-review-heading" className="font-serif text-lg">
        Seu pedido
      </h2>

      <ul className="mt-4 space-y-4">
        {items.map((item) => (
          <li key={item.bookId} className="flex gap-3">
            <div className="w-14 shrink-0">
              <BookCover
                coverImageUrl={item.coverImageUrl}
                title={item.title}
                sizes={THUMB_SIZES}
                fit="contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-serif text-sm leading-snug">{item.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.quantity} × {formatPrice(item.unitPrice)}
              </p>
            </div>
            <p className="text-sm font-medium tabular-nums">{formatPrice(item.subtotal)}</p>
          </li>
        ))}
      </ul>

      <Separator className="my-4" />

      <div className="flex items-baseline justify-between">
        <span className="font-medium">Total</span>
        <span className="text-xl font-semibold text-primary tabular-nums">
          {formatPrice(total)}
        </span>
      </div>

      <Link
        href="/cart"
        className="mt-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        Voltar ao carrinho
      </Link>
    </section>
  );
}
