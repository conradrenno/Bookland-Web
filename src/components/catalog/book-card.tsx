import Link from "next/link";

import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { BookCover } from "@/components/catalog/book-cover";
import { RatingStars } from "@/components/catalog/rating-stars";
import { Badge } from "@/components/ui/badge";
import type { BookViewModel } from "@/lib/api/types";
import { formatPrice } from "@/lib/format";

/** Grid breakpoints of the catalogue, so the optimiser fetches the right width. */
const CARD_COVER_SIZES = "(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 45vw";

interface BookCardProps {
  book: BookViewModel;
  /** From the server: decides whether the CTA buys or sends the visitor to sign in. */
  signedIn: boolean;
  /** True for the first row, which is above the fold. */
  priority?: boolean;
}

/**
 * One book in the catalogue grid.
 *
 * A panel with the cover contained in its top half, details below, and the cart
 * action revealed on hover — redesigned in stage 5a from a reference the owner
 * chose (docs/specs/18-cart.md).
 *
 * Still a **Server Component**: the reveal is CSS, not state, so the only thing
 * that ships to the browser is the button itself. A grid of 20 cards hydrates 20
 * small buttons, not 20 cards.
 *
 * Visual order follows the style brief — cover, author, title, price — because
 * that is the order a customer scans a shelf in (docs/specs/11-style-brief.md).
 */
export function BookCard({ book, signedIn, priority }: BookCardProps) {
  return (
    <article className="group relative flex h-full flex-col rounded-lg border border-border bg-card p-3 transition-shadow duration-200 hover:shadow-lg has-focus-visible:shadow-lg">
      <div className="relative">
        <BookCover
          coverImageUrl={book.coverImageUrl}
          title={book.title}
          sizes={CARD_COVER_SIZES}
          priority={priority}
          fit="contain"
        />
        {!book.available && (
          // Out of stock books stay on the shelf, marked — US-05 is explicit that
          // they must not vanish from the listing.
          <Badge
            variant="secondary"
            className="absolute top-0 left-0 bg-background/90 backdrop-blur-sm"
          >
            Indisponível
          </Badge>
        )}
      </div>

      <div className="mt-3 flex flex-1 flex-col gap-1">
        {book.authors.length > 0 && (
          <p className="line-clamp-1 text-xs text-muted-foreground">{book.authors.join(", ")}</p>
        )}

        <h3 className="font-serif text-base leading-snug">
          <Link
            href={`/books/${book.id}`}
            // Stretches the link over the whole card, keeping one anchor in the
            // accessibility tree while the entire tile stays clickable. The CTA
            // below sits above this overlay on its own stacking context.
            className="after:absolute after:inset-0 hover:text-primary focus-visible:text-primary focus-visible:outline-none"
          >
            <span className="line-clamp-2">{book.title}</span>
          </Link>
        </h3>

        <RatingStars rating={book.avgRating} hideEmptyLabel className="mt-0.5" />

        <p className="mt-auto pt-2 text-lg font-semibold text-primary">
          {formatPrice(book.price)}
        </p>
      </div>

      {/*
        The CTA row. Three things are load-bearing here:

        `relative z-10` puts it above the stretched link, so a click buys the
        book instead of opening its page. It is a sibling of the anchor, never a
        child — a <button> inside an <a> is invalid HTML.

        The height is always reserved, so revealing on hover cannot resize the
        card and make the whole row jump.

        `[@media(hover:hover)]` is what keeps this usable on a touch screen,
        where hover does not exist and an opacity-0 button would simply never
        appear. There, it stays visible. `group-focus-within` does the same for
        the keyboard.
      */}
      <div className="relative z-10 mt-3 opacity-100 transition-opacity duration-200 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
        <AddToCartButton bookId={book.id} available={book.available} signedIn={signedIn} />
      </div>
    </article>
  );
}
