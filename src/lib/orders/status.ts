/**
 * `OrderStatus` → what the customer reads, and what they may do about it.
 *
 * Pure data with no React in sight, because two pages need the same answers: the
 * order detail (stage 5b) and the history list (stage 6). Keeping it here also
 * makes the cancellation rule testable without rendering anything.
 *
 * docs/specs/06-orders.md · docs/specs/19-checkout.md
 */

import type { OrderStatus } from "@/lib/api/types";

export interface OrderStatusPresentation {
  label: string;
  /** Badge classes, built on the semantic tokens so dark mode follows along. */
  className: string;
  /**
   * Whether the customer may cancel from here.
   *
   * From the backend README, confirmed live in 2026-07-30: cancellation is
   * allowed from `AWAITING_PAYMENT` or `CONFIRMED`, and cancelling a confirmed
   * order restores stock and refunds automatically. **Nothing in stage 5b reads
   * this** — it is what the cancel button in stage 6 will ask. The authority
   * stays the `DELETE` response; this only decides whether to offer the button.
   */
  cancellable: boolean;
}

const PRESENTATION: Record<OrderStatus, OrderStatusPresentation> = {
  // Never actually seen by a customer: checkout charges inside the same call and
  // hands back a CONFIRMED order. Kept because it is in the contract's enum and
  // appears in every `statusHistory`.
  AWAITING_PAYMENT: {
    label: "Aguardando pagamento",
    className: "bg-warning/15 text-warning",
    cancellable: true,
  },
  CONFIRMED: {
    label: "Confirmado",
    className: "bg-success/15 text-success",
    cancellable: true,
  },
  SHIPPED: {
    label: "Enviado",
    className: "bg-info/15 text-info",
    cancellable: false,
  },
  DELIVERED: {
    label: "Entregue",
    className: "bg-success/15 text-success",
    cancellable: false,
  },
  CANCELLED: {
    label: "Cancelado",
    className: "bg-muted text-muted-foreground",
    cancellable: false,
  },
  PAYMENT_FAILED: {
    label: "Pagamento não aprovado",
    className: "bg-destructive/10 text-destructive",
    cancellable: false,
  },
};

/**
 * Neutral fallback for a status the contract gains after this was written.
 *
 * Showing the raw value beats showing nothing: it is at least searchable, and
 * `cancellable: false` means an unknown state never offers a destructive action.
 */
function unknownStatus(status: string): OrderStatusPresentation {
  return { label: status, className: "bg-muted text-muted-foreground", cancellable: false };
}

export function describeOrderStatus(status: OrderStatus): OrderStatusPresentation {
  return PRESENTATION[status] ?? unknownStatus(status);
}

/** Whether the customer may cancel an order in this status. */
export function isCancellable(status: OrderStatus): boolean {
  return describeOrderStatus(status).cancellable;
}
