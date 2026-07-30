"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { TextField } from "@/components/form/text-field";
import type { PaymentMethod } from "@/lib/api/types";
import {
  formatCardNumber,
  formatExpiry,
  type CheckoutValues,
} from "@/lib/checkout/payment-schema";

interface PaymentFieldsProps {
  method: PaymentMethod;
  register: UseFormRegister<CheckoutValues>;
  errors: FieldErrors<CheckoutValues>;
}

/**
 * The payment details — **decorative, and required anyway**.
 *
 * The API accepts `paymentMethod` and nothing else, so none of this leaves the
 * browser. It is validated all the same, because the owner asked for a checkout
 * that behaves like a shop's and a card box that accepts anything does not
 * (docs/specs/19-checkout.md).
 *
 * Two things here are not cosmetic:
 *
 * `autoComplete="off"` on every input. The payment tokens — `cc-number`,
 * `cc-exp`, `cc-csc` — would make the browser offer the visitor's **real** card
 * to a field that is pretending. The same goes for the PIX key, which is often a
 * CPF.
 *
 * The notice sits **with** the fields, not at the foot of the page: it has to be
 * read before typing, not after.
 */
export function PaymentFields({ method, register, errors }: PaymentFieldsProps) {
  if (method === "PIX") {
    return (
      <Block notice="Simulação — nada digitado aqui é enviado a lugar nenhum. Não use dados reais.">
        <TextField
          label="Chave PIX"
          autoComplete="off"
          placeholder="e-mail, CPF, telefone ou chave aleatória"
          error={errors.pixKey?.message}
          {...register("pixKey")}
        />
      </Block>
    );
  }

  if (method === "PAYPAL") {
    return (
      <Block notice="Simulação — nada digitado aqui é enviado a lugar nenhum. Não use dados reais.">
        <TextField
          label="E-mail do PayPal"
          type="email"
          autoComplete="off"
          error={errors.paypalEmail?.message}
          {...register("paypalEmail")}
        />
      </Block>
    );
  }

  return (
    // The example number is not decoration: the check digit rejects sixteen
    // random digits almost every time, and without a number that works nobody
    // could get through the demo.
    <Block notice="Simulação — use um número de teste, por exemplo 4111 1111 1111 1111. Nada digitado aqui é enviado a lugar nenhum; não use dados reais.">
      <TextField
        label="Número do cartão"
        inputMode="numeric"
        autoComplete="off"
        placeholder="0000 0000 0000 0000"
        error={errors.cardNumber?.message}
        {...register("cardNumber", {
          // Formats in place as they type; RHF reads `target.value` afterwards.
          onChange: (event) => {
            event.target.value = formatCardNumber(event.target.value);
          },
        })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Validade"
          inputMode="numeric"
          autoComplete="off"
          placeholder="MM/AA"
          error={errors.cardExpiry?.message}
          {...register("cardExpiry", {
            onChange: (event) => {
              event.target.value = formatExpiry(event.target.value);
            },
          })}
        />
        <TextField
          label="CVV"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000"
          maxLength={4}
          error={errors.cardCvv?.message}
          {...register("cardCvv")}
        />
      </div>

      <TextField
        label="Nome impresso no cartão"
        autoComplete="off"
        error={errors.cardHolder?.message}
        {...register("cardHolder")}
      />
    </Block>
  );
}

function Block({ notice, children }: { notice: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {children}
      <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {notice}
      </p>
    </div>
  );
}
