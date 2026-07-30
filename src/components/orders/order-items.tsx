import Link from "next/link";

import { BookCover } from "@/components/catalog/book-cover";
import type { OrderItemViewModel } from "@/lib/api/types";
import { formatPrice } from "@/lib/format";

const THUMB_SIZES = "64px";

/**
 * What was bought, at the prices that were paid.
 *
 * Everything here is a **snapshot**: the backend freezes title, cover and unit
 * price at checkout, so a book that later changed price — or left the catalogue
 * — still reads the way the receipt should. The title still links to the
 * catalogue page, which may well show something different; that is correct, and
 * the reason the prices come from the order rather than from the book.
 */
export function OrderItems({ items }: { items: OrderItemViewModel[] }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <li key={item.bookId} className="flex gap-4 py-4">
          <div className="w-16 shrink-0">
            <BookCover
              coverImageUrl={item.coverImageUrl}
              title={item.title}
              sizes={THUMB_SIZES}
              fit="contain"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <h3 className="font-serif text-base leading-snug">
              <Link href={`/books/${item.bookId}`} className="hover:text-primary">
                {item.title}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">
              {item.quantity} × {formatPrice(item.unitPrice)}
            </p>
          </div>

          <p className="self-center font-semibold text-primary tabular-nums">
            {formatPrice(item.subtotal)}
          </p>
        </li>
      ))}
    </ul>
  );
}
