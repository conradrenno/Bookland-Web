"use client";

import { LoaderCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cancelOrder } from "@/lib/api/orders-client";
import { withNextParam } from "@/lib/auth/next-path";
import { formatPrice } from "@/lib/format";

interface CancelOrderButtonProps {
  orderId: string;
  /** Named in the confirmation, so the customer sees what is being refunded. */
  totalAmount: number;
}

/**
 * US-16 — "Cancelar pedido", behind a confirmation.
 *
 * Rendered only when `isCancellable(order.status)`; the page decides that, so
 * this component never has to reason about status.
 *
 * **The dialog is not decoration.** Cancelling restores stock and refunds the
 * payment upstream, automatically and without an undo — verified live
 * (09-contract-notes.md item 28). The copy says exactly that, with the real
 * amount, because "tem certeza?" tells no one anything.
 *
 * On success it calls `router.refresh()` rather than using the returned order.
 * The response does carry the updated order, but the status badge, the timeline
 * and the payment panel all have to move with it, and they are server-rendered —
 * re-running the server render moves them together. Same reasoning as
 * `AddToCartButton` (docs/specs/20-orders-history.md).
 */
export function CancelOrderButton({ orderId, totalAmount }: CancelOrderButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);

    const result = await cancelOrder(orderId);

    if (result.ok) {
      // Left pending on purpose: the dialog closes and the page re-renders, so
      // there is no moment where an enabled button invites a second cancel.
      setOpen(false);
      router.refresh();
      return;
    }

    setPending(false);
    if (result.sessionExpired) {
      router.push(withNextParam("/login", pathname));
      return;
    }
    // Stays open — the message belongs next to the action it explains. The
    // likeliest one is the 409: already cancelled, or no longer cancellable.
    setError(result.message);
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // A dismissed dialog must not keep a stale failure for the next opening.
        if (!next) setError(null);
        setOpen(next);
      }}
    >
      {/* `outline`, not `destructive`: on a page the customer opened to look at
          a purchase, a red button is the loudest thing on screen. The weight
          belongs in the dialog, where the decision is actually made. */}
      <AlertDialogTrigger render={<Button variant="outline" className="w-full" />}>
        Cancelar pedido
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar este pedido?</AlertDialogTitle>
          <AlertDialogDescription>
            Os itens voltam para o estoque e o pagamento de {formatPrice(totalAmount)} é estornado.
            Não é possível desfazer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p role="alert" className="text-sm leading-snug text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Manter pedido</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirm} disabled={pending}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden />}
            {pending ? "Cancelando…" : "Sim, cancelar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
