/**
 * pt-BR names for the payment vocabulary.
 *
 * Shared by the checkout's method picker and the order page, which is the whole
 * reason it is not sitting inside one of them: "PIX" appears when choosing and
 * again when reading back, and two hand-written maps drift.
 *
 * The contract owns the values; this owns what they are called.
 */

import type { PaymentMethod, PaymentStatus } from "@/lib/api/types";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: "PIX",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  PAYPAL: "PayPal",
};

export interface PaymentStatusPresentation {
  label: string;
  className: string;
}

const STATUS: Record<PaymentStatus, PaymentStatusPresentation> = {
  PENDING: { label: "Processando", className: "bg-warning/15 text-warning" },
  APPROVED: { label: "Aprovado", className: "bg-success/15 text-success" },
  DECLINED: { label: "Não aprovado", className: "bg-destructive/10 text-destructive" },
  // Cancelling a confirmed order starts a refund, which settles asynchronously.
  REFUND_PENDING: { label: "Estorno em andamento", className: "bg-warning/15 text-warning" },
  REFUNDED: { label: "Estornado", className: "bg-muted text-muted-foreground" },
  REFUND_FAILED: {
    label: "Estorno com problema",
    className: "bg-destructive/10 text-destructive",
  },
};

export function describePaymentStatus(status: PaymentStatus): PaymentStatusPresentation {
  return STATUS[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
}

export function labelForPaymentMethod(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}
