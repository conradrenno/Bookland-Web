"use client";

import { CreditCard, QrCode, Wallet } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/api/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/payments/labels";

const ICONS: Record<PaymentMethod, typeof QrCode> = {
  PIX: QrCode,
  CREDIT_CARD: CreditCard,
  DEBIT_CARD: CreditCard,
  PAYPAL: Wallet,
};

interface PaymentMethodPickerProps {
  /** `register("paymentMethod")` — spread across all four inputs, same name. */
  registration: UseFormRegisterReturn;
  selected: PaymentMethod;
}

/**
 * How the customer will pay — the only field the API actually receives.
 *
 * Native radios inside labels, not a custom widget: arrow keys, `Tab` landing on
 * the selected option, and screen-reader announcements all come free, and the
 * whole tile is clickable because the input lives inside its label.
 */
export function PaymentMethodPicker({ registration, selected }: PaymentMethodPickerProps) {
  return (
    <fieldset>
      <legend className="mb-3 font-serif text-lg">Forma de pagamento</legend>

      <div className="grid gap-2 sm:grid-cols-2">
        {PAYMENT_METHODS.map((method) => {
          const Icon = ICONS[method];
          const isSelected = selected === method;

          return (
            <label
              key={method}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50 ${
                isSelected
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border hover:bg-muted/60"
              }`}
            >
              <input
                type="radio"
                value={method}
                // Only the ring on the label shows focus, so the dot itself can
                // be the browser's — no custom control to get wrong.
                className="accent-primary"
                {...registration}
              />
              <Icon aria-hidden className="size-4 text-muted-foreground" />
              {PAYMENT_METHOD_LABELS[method]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
