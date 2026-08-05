import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import type { OrderSummaryViewModel } from "@/lib/api/types";
import { formatDate, formatPrice } from "@/lib/format";

/** How much of the UUID a customer is asked to read out — same as the detail page. */
const SHORT_ID_LENGTH = 8;

/**
 * One row of the order history (US-15).
 *
 * **No thumbnails.** `OrderSummaryViewModel` carries `itemCount` and nothing
 * else about the items — showing covers would mean one `GET /orders/{id}` per
 * row, which is a lot of upstream traffic to decorate a list whose job is to get
 * the customer to the order they are looking for.
 *
 * The whole card is the link, not a "ver detalhes" tucked in a corner: the row
 * has one destination, and a bigger target is easier to hit on a phone.
 */
export function OrderSummaryCard({ order }: { order: OrderSummaryViewModel }) {
  return (
    <li>
      <Link
        href={`/orders/${order.id}`}
        className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-4 transition-colors hover:border-primary/40 hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium tabular-nums">Pedido {shortId(order.id)}</span>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {formatDate(order.createdAt)}
            <span aria-hidden> · </span>
            {describeItemCount(order.itemCount)}
          </p>
        </div>

        <span className="shrink-0 font-semibold text-primary tabular-nums">
          {formatPrice(order.totalAmount)}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

/** `f8bbf26e-28bb-…` → `#f8bbf26e`, which is what fits in a row and a chat message. */
function shortId(id: string): string {
  return `#${id.slice(0, SHORT_ID_LENGTH)}`;
}

function describeItemCount(count: number): string {
  return count === 1 ? "1 item" : `${count} itens`;
}
