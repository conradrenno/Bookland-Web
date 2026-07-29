/**
 * pt-BR presentation helpers (docs/specs/07-ui-design.md).
 *
 * The API speaks numbers and ISO strings; formatting happens only at the UI edge.
 * `Intl` formatters are built once at module load — constructing one is the
 * expensive part, and a catalogue page formats a price per card.
 */

const priceFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Dates are pinned to the store's timezone rather than the runtime's.
 *
 * Without this the server renders in the host's zone and the browser rehydrates
 * in the visitor's, so an order placed late at night shows two different dates
 * and React reports a hydration mismatch. A Brazilian storefront has one correct
 * answer, so we state it.
 */
const STORE_TIME_ZONE = "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: STORE_TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: STORE_TIME_ZONE,
});

/** Placeholder for a value we cannot render — an em dash reads better than "NaN". */
const MISSING = "—";

/** `44.9` → `"R$ 44,90"` (with a non-breaking space, as pt-BR requires). */
export function formatPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return MISSING;
  return priceFormatter.format(value);
}

/** ISO-8601 → `"28/07/2026"`. */
export function formatDate(isoDateTime: string | null | undefined): string {
  const date = parseIso(isoDateTime);
  return date ? dateFormatter.format(date) : MISSING;
}

/** ISO-8601 → `"28/07/2026, 11:30"`. */
export function formatDateTime(isoDateTime: string | null | undefined): string {
  const date = parseIso(isoDateTime);
  return date ? dateTimeFormatter.format(date) : MISSING;
}

/**
 * `4.5` → `"4,5"`. Returns `null` when the book has no rating yet.
 *
 * The upstream sends `avgRating: 0.0` for a book nobody reviewed, which is not
 * the same as a book rated zero — the contract has no such rating, since reviews
 * are 1..5. Collapsing both to `null` keeps "zero stars" off the screen.
 */
export function formatRating(avgRating: number | null | undefined): string | null {
  if (typeof avgRating !== "number" || !Number.isFinite(avgRating) || avgRating <= 0) {
    return null;
  }
  return avgRating.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
