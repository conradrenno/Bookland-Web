import { Star } from "lucide-react";

import { formatRating } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_STARS = 5;

interface RatingStarsProps {
  /** `BookViewModel.avgRating`. Upstream sends `0` for an unreviewed book. */
  rating?: number;
  /** Hide the "Sem avaliações" line where space is tight (a dense card grid). */
  hideEmptyLabel?: boolean;
  className?: string;
}

/**
 * Average rating as stars plus the number.
 *
 * A book nobody reviewed says so in words instead of showing five empty stars —
 * `formatRating` returns `null` for the upstream's `0.0`, which means "no
 * reviews", not "rated zero" (docs/specs/03-catalog.md).
 */
export function RatingStars({ rating, hideEmptyLabel, className }: RatingStarsProps) {
  const formatted = formatRating(rating);

  if (formatted === null) {
    if (hideEmptyLabel) return null;
    return <p className={cn("text-xs text-muted-foreground", className)}>Sem avaliações</p>;
  }

  const filled = Math.round(rating!);

  return (
    // One label for the whole widget: five separate star labels would make a
    // screen reader read "star star star…" instead of the score.
    <p
      className={cn("flex items-center gap-1", className)}
      aria-label={`${formatted} de ${MAX_STARS} estrelas`}
    >
      <span aria-hidden className="flex items-center gap-0.5">
        {Array.from({ length: MAX_STARS }, (_, index) => (
          <Star
            key={index}
            className={cn(
              "size-3.5",
              index < filled ? "fill-accent text-accent" : "text-border",
            )}
          />
        ))}
      </span>
      <span aria-hidden className="text-xs font-medium text-muted-foreground">
        {formatted}
      </span>
    </p>
  );
}
