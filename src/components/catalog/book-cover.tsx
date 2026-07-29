import Image from "next/image";

import { resolveCoverUrl } from "@/lib/api/covers";
import { cn } from "@/lib/utils";

interface BookCoverProps {
  coverImageUrl?: string;
  title: string;
  /** Responsive hint for the optimiser — a grid thumbnail and the detail page differ. */
  sizes: string;
  /** Set on above-the-fold covers only; marking every card defeats the point. */
  priority?: boolean;
  className?: string;
}

/**
 * The cover, at a fixed 2:3 ratio whether or not there is an image.
 *
 * Keeping the frame identical in both cases is what stops a row of cards from
 * shifting as images load, and it is why the placeholder is a styled panel
 * rather than a missing element (docs/specs/03-catalog.md).
 */
export function BookCover({ coverImageUrl, title, sizes, priority, className }: BookCoverProps) {
  const source = resolveCoverUrl(coverImageUrl);

  return (
    <div
      className={cn(
        "relative aspect-2/3 w-full overflow-hidden rounded-md bg-muted shadow-sm ring-1 ring-border/60",
        className,
      )}
    >
      {source ? (
        <Image
          src={source}
          alt={`Capa de ${title}`}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <CoverPlaceholder title={title} />
      )}
    </div>
  );
}

/**
 * Stand-in for a book with no cover: the title set in serif on a warm panel,
 * echoing a plain cloth binding. `aria-hidden` because the card already names
 * the book — a screen reader should not hear the title twice.
 */
function CoverPlaceholder({ title }: { title: string }) {
  return (
    <div
      aria-hidden
      className="flex h-full w-full flex-col items-center justify-center gap-2 bg-secondary px-3 py-4 text-center"
    >
      <span className="h-px w-8 bg-accent" />
      <span className="line-clamp-4 font-serif text-sm leading-snug text-secondary-foreground">
        {title}
      </span>
      <span className="h-px w-8 bg-accent" />
    </div>
  );
}
