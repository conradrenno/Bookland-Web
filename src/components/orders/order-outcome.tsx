"use client";

import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { readOrder } from "@/lib/api/orders-client";
import type { OrderStatus, UUID } from "@/lib/api/types";
import { isCheckoutFailure, isCheckoutRunning } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

/** How often to ask while the checkout runs. */
export const POLL_INTERVAL_MS = 1_500;

/**
 * When to stop asking. With the payment gateway slow or down an order can sit
 * in `AWAITING_PAYMENT` for a long time; past this the customer is told they
 * will hear by e-mail, rather than watching a spinner forever.
 */
export const POLL_CEILING_MS = 60_000;

interface OrderOutcomeProps {
  orderId: UUID;
  status: OrderStatus;
  statusReason: string | null;
}

/**
 * The banner at the top of an order page that tells how the checkout went.
 *
 * The checkout is asynchronous: the customer lands here on a `PENDING` order,
 * and the outcome arrives seconds later (docs/specs/21, stage 4). While it runs
 * this polls the BFF, and the moment the status moves it calls
 * `router.refresh()` — the server re-renders the whole page, payment panel and
 * header cart badge included, and this component receives the new status.
 *
 * It keeps its state across that refresh, which is how it knows to say
 * "confirmed" only to someone who was actually waiting for it, and not on
 * every later visit to an old order.
 */
export function OrderOutcome({ orderId, status, statusReason }: OrderOutcomeProps) {
  const router = useRouter();
  const running = isCheckoutRunning(status);
  // Set once, on the first render: was this page following a checkout?
  const [followed] = useState(running);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!running) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function poll() {
      if (cancelled) return;
      if (Date.now() - startedAt >= POLL_CEILING_MS) {
        setSlow(true);
        return;
      }
      // A hidden tab keeps its place in line but spends no requests.
      if (document.visibilityState !== "hidden") {
        const result = await readOrder(orderId);
        if (cancelled) return;
        if (result.ok && result.data.status !== status) {
          router.refresh();
          return;
        }
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderId, status, running, router]);

  if (running) {
    return (
      <Banner tone="waiting" icon={<LoaderCircle className="animate-spin" aria-hidden />}>
        {slow ? (
          <>
            <p className="font-medium">Seu pagamento está demorando mais que o normal.</p>
            <p className="text-sm text-muted-foreground">
              Você pode fechar esta página: avisaremos por e-mail assim que o pedido for
              confirmado.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">
              {status === "PENDING" ? "Reservando seus livros…" : "Confirmando o pagamento…"}
            </p>
            <p className="text-sm text-muted-foreground">Isso costuma levar poucos segundos.</p>
          </>
        )}
      </Banner>
    );
  }

  if (isCheckoutFailure(status)) {
    return (
      <Banner tone="failed" icon={<CircleAlert aria-hidden />}>
        <p className="font-medium">
          {status === "REJECTED"
            ? "Não conseguimos reservar todos os livros."
            : "O pagamento não foi aprovado."}
        </p>
        {/* Written by the backend in English for now — still better than
            guessing which book ran out. */}
        {statusReason && <p className="text-sm text-muted-foreground">{statusReason}</p>}
        <p className="text-sm text-muted-foreground">
          Nada foi cobrado, e seus livros continuam no carrinho.
        </p>
        <Link
          href="/cart"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 w-fit")}
        >
          Voltar ao carrinho
        </Link>
      </Banner>
    );
  }

  if (followed && status === "CONFIRMED") {
    return (
      <Banner tone="confirmed" icon={<CircleCheck aria-hidden />}>
        <p className="font-medium">Pedido confirmado!</p>
        <p className="text-sm text-muted-foreground">
          Enviamos os detalhes para o seu e-mail.
        </p>
      </Banner>
    );
  }

  return null;
}

const TONES = {
  waiting: "border-warning/40 bg-warning/10 [&>svg]:text-warning",
  failed: "border-destructive/40 bg-destructive/10 [&>svg]:text-destructive",
  confirmed: "border-success/40 bg-success/10 [&>svg]:text-success",
} as const;

/**
 * `role="status"` is a polite live region: a screen reader announces the
 * outcome when it replaces the waiting message, without interrupting.
 */
function Banner({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div role="status" className={cn("mb-8 flex gap-3 rounded-lg border p-4", TONES[tone])}>
      {icon}
      <div className="space-y-1">{children}</div>
    </div>
  );
}
