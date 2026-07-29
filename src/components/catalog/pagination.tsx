import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import type { BookSearchParams } from "@/lib/api/types";
import { buildCatalogHref } from "@/lib/catalog/search-href";
import { cn } from "@/lib/utils";

/** How many numbered pages to show around the current one. */
const WINDOW = 2;

interface PaginationProps {
  params: BookSearchParams;
  /** Zero-based, as the contract counts them. */
  page: number;
  totalPages: number;
  path?: string;
}

/**
 * Pager for the catalogue listing.
 *
 * Plain links, no client JavaScript: each page is a real URL that can be shared,
 * opened in a new tab and crawled — which is the point of rendering the
 * catalogue on the server at all.
 *
 * Pages are zero-based in the contract and one-based on screen. Nobody asks for
 * "page 0", so the translation happens here rather than leaking into the URL.
 */
export function Pagination({ params, page, totalPages, path }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = pageWindow(page, totalPages);

  return (
    <nav aria-label="Paginação do catálogo" className="flex items-center justify-center gap-1 pt-4">
      <Step
        direction="previous"
        href={buildCatalogHref(params, { page: page - 1 }, path)}
        disabled={page === 0}
      />

      {pages.map((entry, index) =>
        entry === null ? (
          <span key={`gap-${index}`} aria-hidden className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <PageLink
            key={entry}
            href={buildCatalogHref(params, { page: entry }, path)}
            number={entry + 1}
            current={entry === page}
          />
        ),
      )}

      <Step
        direction="next"
        href={buildCatalogHref(params, { page: page + 1 }, path)}
        disabled={page >= totalPages - 1}
      />
    </nav>
  );
}

const STEP_LABELS = {
  previous: { label: "Página anterior", Icon: ChevronLeft },
  next: { label: "Próxima página", Icon: ChevronRight },
} as const;

/**
 * Previous/next. At the ends it renders a `span`, not a disabled link: there is
 * no such thing as a disabled anchor, and a link to a page that does not exist
 * is worse than no link.
 */
function Step({
  direction,
  href,
  disabled,
}: {
  direction: keyof typeof STEP_LABELS;
  href: string;
  disabled: boolean;
}) {
  const { label, Icon } = STEP_LABELS[direction];
  const shared = "inline-flex size-9 items-center justify-center rounded-md border border-border";

  if (disabled) {
    return (
      <span aria-hidden className={cn(shared, "opacity-40")}>
        <Icon className="size-4" />
      </span>
    );
  }

  return (
    <Link href={href} aria-label={label} className={cn(shared, "hover:bg-muted")}>
      <Icon className="size-4" />
    </Link>
  );
}

function PageLink({ href, number, current }: { href: string; number: number; current: boolean }) {
  return (
    <Link
      href={href}
      aria-label={`Página ${number}`}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm",
        current
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border hover:bg-muted",
      )}
    >
      {number}
    </Link>
  );
}

/**
 * The page numbers to render: first, last, a window around the current page, and
 * `null` wherever a run was skipped.
 *
 * Without the window a catalogue of 90 pages renders 90 links; with only the
 * window, the first and last pages become unreachable in one click.
 */
function pageWindow(page: number, totalPages: number): (number | null)[] {
  const shown = new Set<number>([0, totalPages - 1]);
  for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 0 && candidate < totalPages) shown.add(candidate);
  }

  const ordered = [...shown].sort((a, b) => a - b);
  const withGaps: (number | null)[] = [];
  let previous: number | undefined;

  for (const current of ordered) {
    if (previous !== undefined && current - previous > 1) withGaps.push(null);
    withGaps.push(current);
    previous = current;
  }

  return withGaps;
}
