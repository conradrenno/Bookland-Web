import Link from "next/link";

import { BookCover } from "@/components/catalog/book-cover";
import { RatingStars } from "@/components/catalog/rating-stars";
import { Badge } from "@/components/ui/badge";
import type { BookViewModel } from "@/lib/api/types";
import { formatPrice } from "@/lib/format";

/** Grid breakpoints of the catalogue, so the optimiser fetches the right width. */
const CARD_COVER_SIZES = "(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 45vw";

interface BookCardProps {
  book: BookViewModel;
  /** True for the first row, which is above the fold. */
  priority?: boolean;
}

/**
 * One book in the catalogue grid.
 *
 * Visual order follows the style brief — cover, title, author, price — because
 * that is the order a customer scans a shelf in (docs/specs/11-style-brief.md).
 *
 * The whole card is one link rather than a card containing several: nesting an
 * "add to cart" button inside a link is invalid HTML and makes the hit target
 * ambiguous. The cart action arrives on the detail page and in stage 5.
 */
export function BookCard({ book, priority }: BookCardProps) {
  return (
    <article className="group relative flex flex-col gap-3">
      <div className="relative">
        <BookCover
          coverImageUrl={book.coverImageUrl}
          title={book.title}
          sizes={CARD_COVER_SIZES}
          priority={priority}
          className="transition-shadow group-hover:shadow-md"
        />
        {!book.available && (
          // Out of stock books stay on the shelf, marked — US-05 is explicit that
          // they must not vanish from the listing.
          <Badge
            variant="secondary"
            className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm"
          >
            Indisponível
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <h3 className="font-serif text-base leading-snug">
          <Link
            href={`/books/${book.id}`}
            // Stretches the link over the whole card, keeping one anchor in the
            // accessibility tree while the entire tile stays clickable.
            className="after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:text-primary"
          >
            <span className="line-clamp-2">{book.title}</span>
          </Link>
        </h3>

        {book.authors.length > 0 && (
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {book.authors.join(", ")}
          </p>
        )}

        <RatingStars rating={book.avgRating} hideEmptyLabel className="mt-0.5" />

        <p className="mt-auto pt-1 text-lg font-semibold text-primary">
          {formatPrice(book.price)}
        </p>
      </div>
    </article>
  );
}
