import Image from "next/image";

import { resolveCoverUrl } from "@/lib/api/covers";
import { cn } from "@/lib/utils";

/**
 * How the image sits in its 2:3 frame.
 *
 * `cover` fills the frame and **crops** whatever does not fit — right for the
 * detail page, where the cover is the hero and a sliver off the edge is
 * invisible. `contain` fits the whole image inside and lets the frame show
 * around it, which is what the catalogue card wants: book covers are not all
 * 2:3, and cropping a row of them shaves the title off some and not others.
 */
export type CoverFit = "cover" | "contain";

interface BookCoverProps {
  coverImageUrl?: string;
  title: string;
  /** Responsive hint for the optimiser — a grid thumbnail and the detail page differ. */
  sizes: string;
  /** Set on above-the-fold covers only; marking every card defeats the point. */
  priority?: boolean;
  fit?: CoverFit;
  className?: string;
}

/**
 * The cover, at a fixed 2:3 ratio whether or not there is an image.
 *
 * Keeping the frame identical in both cases is what stops a row of cards from
 * shifting as images load, and it is why the placeholder is a styled panel
 * rather than a missing element (docs/specs/03-catalog.md).
 */
export function BookCover({
  coverImageUrl,
  title,
  sizes,
  priority,
  fit = "cover",
  className,
}: BookCoverProps) {
  const source = resolveCoverUrl(coverImageUrl);
  const contained = fit === "contain";

  return (
    <div
      className={cn(
        "relative aspect-2/3 w-full overflow-hidden rounded-md",
        // A contained image does not reach the edges, so a border and a shadow
        // would outline empty space rather than the cover. The card panel
        // behind it supplies both.
        contained ? "bg-transparent" : "bg-muted shadow-sm ring-1 ring-border/60",
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
          className={cn(
            contained ? "object-contain drop-shadow-sm" : "object-cover",
          )}
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
