import { CreditCard, QrCode, Wallet } from "lucide-react";

/**
 * Payment marks for the footer — decorative only.
 *
 * Wordmark plus a generic icon, never the brands' real logos: those are
 * trademarked artwork, and Visa's or PayPal's actual marks come with usage rules
 * we have no licence to follow. Lucide carries no brand icons either — by
 * policy — so each row gets the closest generic glyph and the name does the
 * identifying. The icon is `aria-hidden`; the word is what a screen reader
 * reads.
 *
 * Inline SVG (lucide compiles to it): no extra request, no external host to
 * whitelist, and they inherit the surrounding colour.
 *
 * ⚠️ These are a trust seal, not configuration. What the checkout actually
 * accepts is the API's `PaymentMethod` enum (docs/specs/14-footer.md).
 */

const MARKS = [
  { label: "Visa", text: "VISA", Icon: CreditCard },
  { label: "Mastercard", text: "MC", Icon: CreditCard },
  { label: "Pix", text: "PIX", Icon: QrCode },
  { label: "PayPal", text: "PayPal", Icon: Wallet },
  // No boleto: `PaymentMethod` has no such value, and a seal for something the
  // checkout cannot take is a lie on the page.
] as const;

export function PaymentMarks() {
  return (
    <ul aria-label="Formas de pagamento aceitas" className="flex flex-wrap gap-2">
      {MARKS.map((mark) => (
        <li key={mark.label}>
          <span
            title={mark.label}
            // Translucent light rather than a cream chip: on the wood footer a
            // solid pale block would read as a hole punched in the bar.
            className="inline-flex h-8 min-w-14 items-center justify-center gap-1.5 rounded-md border border-surface-foreground/25 bg-surface-foreground/10 px-2 text-[0.7rem] font-semibold tracking-wide text-surface-foreground/85"
          >
            <mark.Icon aria-hidden className="size-3.5 opacity-80" />
            {mark.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
