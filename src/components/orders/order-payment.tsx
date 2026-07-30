import { Badge } from "@/components/ui/badge";
import type { PaymentViewModel } from "@/lib/api/types";
import { formatPrice } from "@/lib/format";
import { describePaymentStatus, labelForPaymentMethod } from "@/lib/payments/labels";
import { cn } from "@/lib/utils";

/**
 * How the order was paid.
 *
 * Its own panel because it comes from its own endpoint: `OrderViewModel` carries
 * no `paymentMethod`, so without `GET /payments/order/{id}` the customer cannot
 * see the method they chose a minute earlier (docs/specs/19-checkout.md).
 *
 * `gatewayTransactionId` is deliberately not shown. It is a simulator's marker
 * (`SIM-…`) and means nothing to a customer.
 */
export function OrderPayment({ payment }: { payment: PaymentViewModel }) {
  const status = describePaymentStatus(payment.status);

  return (
    <section
      aria-labelledby="order-payment-heading"
      className="rounded-lg border border-border bg-card p-5"
    >
      <h2 id="order-payment-heading" className="font-serif text-lg">
        Pagamento
      </h2>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Forma</dt>
          <dd>{labelForPaymentMethod(payment.method)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Situação</dt>
          <dd>
            <Badge variant="secondary" className={cn(status.className)}>
              {status.label}
            </Badge>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Valor</dt>
          <dd className="tabular-nums">{formatPrice(payment.amount)}</dd>
        </div>
      </dl>
    </section>
  );
}
