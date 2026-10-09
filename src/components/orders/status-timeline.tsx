import type { StatusTransitionViewModel } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { describeOrderStatus } from "@/lib/orders/status";

/**
 * The order's history, oldest first.
 *
 * Sorted here rather than trusted from the API: the contract promises an order
 * for `GET /admin/orders` and says nothing about this array, and a timeline that
 * runs backwards is worse than no timeline (09-contract-notes.md item 27).
 *
 * The checkout saga writes the first entries: `PENDING → AWAITING_PAYMENT` once
 * the stock is reserved, then `→ CONFIRMED` or `→ PAYMENT_FAILED`; a `REJECTED`
 * order has just `PENDING → REJECTED`. An order still `PENDING` has no history
 * yet, so nothing renders. Saga transitions carry no `changedBy`, which this
 * never shows anyway (docs/specs/21).
 */
export function StatusTimeline({ history }: { history: StatusTransitionViewModel[] }) {
  if (history.length === 0) return null;

  const ordered = [...history].sort(
    (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
  );

  return (
    <section aria-labelledby="order-history-heading">
      <h2 id="order-history-heading" className="font-serif text-lg">
        Histórico
      </h2>

      <ol className="mt-3 space-y-3">
        {ordered.map((transition) => (
          <li
            key={`${transition.changedAt}-${transition.toStatus}`}
            className="flex gap-3 text-sm"
          >
            {/* The rail is decoration: the list already conveys the sequence. */}
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
            <div>
              <p>{describeOrderStatus(transition.toStatus).label}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(transition.changedAt)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
