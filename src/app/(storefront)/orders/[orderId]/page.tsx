import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { OrderItems } from "@/components/orders/order-items";
import { OrderPayment } from "@/components/orders/order-payment";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { StatusTimeline } from "@/components/orders/status-timeline";
import { isApiError } from "@/lib/api/errors";
import { getOrder } from "@/lib/api/orders";
import { getOrderPayment } from "@/lib/api/payments";
import type { OrderViewModel, PaymentViewModel } from "@/lib/api/types";
import { isUuid } from "@/lib/api/uuid";
import { getAccessToken } from "@/lib/auth/server";
import { formatDate, formatPrice } from "@/lib/format";

/** How much of the UUID a customer is asked to read out. */
const SHORT_ID_LENGTH = 8;

interface OrderPageProps {
  params: Promise<{ orderId: string }>;
}

export const metadata: Metadata = {
  title: "Pedido",
  // One customer's purchase — nothing for an index to hold.
  robots: { index: false, follow: false },
};

/**
 * US-18 — one order.
 *
 * Where the checkout lands, and where `/orders` will link in stage 6. Read-only:
 * cancelling is stage 6's, and this page exists first because a customer who has
 * just paid needs to see what they bought.
 *
 * Everything shown is the **snapshot** the backend froze at checkout — prices,
 * titles and covers — so the page keeps telling the truth after the catalogue
 * moves on (docs/specs/19-checkout.md).
 */
export default async function OrderPage({ params }: OrderPageProps) {
  const { orderId } = await params;
  const { order, payment } = await loadOrder(orderId);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <nav aria-label="Trilha" className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-primary">
          Catálogo
        </Link>
        <span aria-hidden> · </span>
        <span className="text-foreground">Pedido {shortId(order.id)}</span>
      </nav>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
            Pedido {shortId(order.id)}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Feito em {formatDate(order.createdAt)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} className="mt-1" />
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_18rem] lg:gap-10">
        <div className="space-y-8">
          <section aria-labelledby="order-items-heading">
            <h2 id="order-items-heading" className="sr-only">
              Itens do pedido
            </h2>
            <OrderItems items={order.items} />

            <div className="mt-4 flex items-baseline justify-between">
              <span className="font-medium">Total</span>
              <span className="text-xl font-semibold text-primary tabular-nums">
                {formatPrice(order.totalAmount)}
              </span>
            </div>
          </section>

          <StatusTimeline history={order.statusHistory} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {/* Absent when the payment lookup failed — a missing panel, not a
              broken page. */}
          {payment && <OrderPayment payment={payment} />}

          <Link
            href="/"
            className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            Continuar comprando
          </Link>
        </aside>
      </div>
    </div>
  );
}

/**
 * The order and, if it can be had, its payment.
 *
 * Both calls go out together: the payment is a second endpoint, and waiting for
 * it in series would add a round trip to a page that already has everything else
 * it needs.
 *
 * **A 403 is treated as a 404.** Someone else's order is not this customer's
 * business, and answering "you may not see this" would confirm that it exists.
 * Whether the upstream even sends 403 here has not been measured yet — the safe
 * reading costs nothing either way.
 */
async function loadOrder(
  orderId: string,
): Promise<{ order: OrderViewModel; payment: PaymentViewModel | null }> {
  // A malformed id is a bad link, not a bad request: the upstream would answer
  // 400, and the page a customer typed wrong is simply missing.
  if (!isUuid(orderId)) notFound();

  const accessToken = await getAccessToken();
  // The middleware protects `/orders`, so this only happens when the cookie died
  // between it and this render.
  if (!accessToken) redirect(signInPath(orderId));

  const [order, payment] = await Promise.all([
    getOrder(accessToken, orderId).catch((error: unknown) => {
      if (isApiError(error) && (error.isNotFound || error.isForbidden)) notFound();
      if (isApiError(error) && error.isSessionProblem) redirect(signInPath(orderId));
      throw error;
    }),
    // Degrades on purpose: a payment we cannot read hides its panel.
    getOrderPayment(accessToken, orderId).catch(() => null),
  ]);

  return { order, payment };
}

function signInPath(orderId: string): string {
  return `/login?next=${encodeURIComponent(`/orders/${orderId}`)}`;
}

/** `f8bbf26e-28bb-…` → `#f8bbf26e`, which is what fits in a heading and a chat message. */
function shortId(id: string): string {
  return `#${id.slice(0, SHORT_ID_LENGTH)}`;
}
