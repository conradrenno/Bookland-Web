"use client";

import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuantityStepperProps {
  quantity: number;
  /**
   * The **new absolute quantity**, never a delta — that is what `PATCH` takes.
   * `0` arrives when the visitor steps below one, and means "remove the line".
   */
  onChange: (quantity: number) => void;
  /** A request is in flight: both controls lock so a second click cannot race it. */
  busy?: boolean;
  /** False for a book that ran out of stock — the only way left is down. */
  canIncrease?: boolean;
  /** Names the controls for a screen reader; with several lines, "Aumentar" alone is useless. */
  itemLabel: string;
  className?: string;
}

/**
 * − / quantity / + for one cart line (docs/specs/18-cart.md).
 *
 * Presentational: it owns no request and no pending flag, so the line above can
 * keep quantity and removal on the same lock. The one piece of logic here is the
 * bottom step — at 1, "−" becomes a removal, because the contract makes
 * `quantity: 0` delete the line and a separate path would be redundant.
 */
export function QuantityStepper({
  quantity,
  onChange,
  busy = false,
  canIncrease = true,
  itemLabel,
  className,
}: QuantityStepperProps) {
  const removes = quantity <= 1;

  return (
    <div
      role="group"
      aria-label={`Quantidade de ${itemLabel}`}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={busy}
        aria-label={
          removes ? `Remover ${itemLabel} do carrinho` : `Diminuir quantidade de ${itemLabel}`
        }
        onClick={() => onChange(quantity - 1)}
      >
        {removes ? <Trash2 aria-hidden /> : <Minus aria-hidden />}
      </Button>

      {/* `aria-live` so the new number is announced after the server answers —
          the value only changes once the refreshed cart arrives. */}
      <span aria-live="polite" className="w-7 text-center text-sm font-medium tabular-nums">
        {quantity}
      </span>

      <Button
        variant="ghost"
        size="icon-sm"
        disabled={busy || !canIncrease}
        aria-label={`Aumentar quantidade de ${itemLabel}`}
        onClick={() => onChange(quantity + 1)}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
