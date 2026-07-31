"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { PaymentFields } from "@/components/checkout/payment-fields";
import { PaymentMethodPicker } from "@/components/checkout/payment-method-picker";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { submitCheckout } from "@/lib/api/checkout-client";
import { ErrorCodes } from "@/lib/api/error-codes";
import { checkoutSchema, type CheckoutValues } from "@/lib/checkout/payment-schema";
import { withNextParam } from "@/lib/auth/next-path";
import { formatPrice } from "@/lib/format";

/** Where a failure that only the cart can fix sends the customer. */
const CART_PATH = "/cart";
/** `?motivo=estoque` is what makes the cart explain itself on arrival. */
const CART_OUT_OF_STOCK = `${CART_PATH}?motivo=estoque`;

const EMPTY_FIELDS = {
  cardNumber: "",
  cardExpiry: "",
  cardCvv: "",
  cardHolder: "",
  pixKey: "",
  paypalEmail: "",
};

/**
 * US-14 — confirms the order.
 *
 * The only mutation in the app that spends money, which shapes two decisions:
 *
 * **It cannot fire twice.** Beyond `disabled`, a ref guards the handler and the
 * button stays locked after success — the promise resolves before the navigation
 * paints, and a re-enabled button in that gap would buy the books again.
 *
 * **Failures navigate rather than explain in place.** Out of stock and an empty
 * cart are both answered by the cart page, which knows which line broke
 * (`available: false`) and can show it. A message here would describe a problem
 * the customer cannot act on from here (docs/specs/19-checkout.md).
 */
export function CheckoutForm({ total }: { total: number }) {
  const router = useRouter();
  const [alert, setAlert] = useState<string | null>(null);
  // Survives the gap between "order created" and "new page painted".
  const [ordered, setOrdered] = useState(false);
  const sending = useRef(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { paymentMethod: "PIX", ...EMPTY_FIELDS },
  });

  // `useWatch` rather than `watch()`: the latter returns a fresh function on
  // every render, which makes the React Compiler skip memoising this component
  // entirely. Same subscription, without the bail-out.
  const method = useWatch({ control, name: "paymentMethod" });
  const busy = isSubmitting || ordered;

  async function onSubmit(values: CheckoutValues) {
    if (sending.current) return;
    sending.current = true;
    setAlert(null);

    // **Only the method travels.** Everything else in `values` is decorative and
    // stops here — see PaymentFields.
    const result = await submitCheckout(values.paymentMethod);

    if (result.ok) {
      setOrdered(true);
      router.push(`/orders/${result.data.id}`);
      // The header badge counts a cart that just became an order.
      router.refresh();
      return;
    }

    sending.current = false;

    if (result.sessionExpired) {
      router.push(withNextParam("/login", "/checkout"));
      return;
    }

    if (result.code === ErrorCodes.CART_ITEM_UNAVAILABLE) {
      router.push(CART_OUT_OF_STOCK);
      router.refresh();
      return;
    }

    if (result.code === ErrorCodes.CART_NOT_FOUND) {
      // Emptied in another tab. The cart's own empty state says it best.
      router.push(CART_PATH);
      router.refresh();
      return;
    }

    setAlert(result.message);
  }

  return (
    <form
      noValidate
      // `handleSubmit` is composed inside the event handler rather than during
      // render: `onSubmit` reads the `sending` ref, and building the callback in
      // the render body has React's lint flag it as a ref read during render.
      onSubmit={(event) => handleSubmit(onSubmit)(event)}
      className="space-y-6"
    >
      <FormAlert>{alert}</FormAlert>

      <PaymentMethodPicker registration={register("paymentMethod")} selected={method} />

      <PaymentFields method={method} register={register} errors={errors} />

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <ShieldCheck aria-hidden />}
        {busy ? "Confirmando…" : `Pagar ${formatPrice(total)}`}
      </Button>
    </form>
  );
}
