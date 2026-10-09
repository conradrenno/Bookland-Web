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
   * **Only `CONFIRMED`.** While the checkout saga is still running (`PENDING`,
   * `AWAITING_PAYMENT`) the backend refuses with `ORDER_CANCELLATION_NOT_ALLOWED`,
   * and once the order shipped it is too late. Cancelling a confirmed order
   * gives the stock back and starts a refund (docs/specs/21). The authority
   * stays the `DELETE` response; this only decides whether to offer the button.
   */
  cancellable: boolean;
}

const PRESENTATION: Record<OrderStatus, OrderStatusPresentation> = {
  // What checkout hands back: the saga has only just started. Seconds later the
  // order moves on, or ends as REJECTED when the stock ran out meanwhile.
  PENDING: {
    label: "Processando",
    className: "bg-warning/15 text-warning",
    cancellable: false,
  },
  // Stock reserved, charge in flight. Can last a while when the payment gateway
  // is slow or down — the customer is e-mailed the outcome either way.
  AWAITING_PAYMENT: {
    label: "Aguardando pagamento",
    className: "bg-warning/15 text-warning",
    cancellable: false,
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
  // The stock ran out while the checkout ran; `statusReason` names the books.
  REJECTED: {
    label: "Recusado",
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

/**
 * Whether the checkout saga is still deciding this order's fate.
 *
 * While it is, the order page keeps asking (docs/specs/21, stage 4): the
 * outcome — `CONFIRMED`, `REJECTED` or `PAYMENT_FAILED` — arrives seconds later,
 * or much later when the payment gateway is slow.
 */
export function isCheckoutRunning(status: OrderStatus): boolean {
  return status === "PENDING" || status === "AWAITING_PAYMENT";
}

/** Whether the checkout ended without an order, leaving the cart as it was. */
export function isCheckoutFailure(status: OrderStatus): boolean {
  return status === "REJECTED" || status === "PAYMENT_FAILED";
}
