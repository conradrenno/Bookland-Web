/**
 * Payment marks for the footer — decorative only.
 *
 * Inline SVG rather than image files: no extra request, no external host to
 * whitelist, and they inherit the surrounding colour. Drawn as wordmarks instead
 * of the brands' real logos, which are trademarked artwork we should not ship.
 *
 * ⚠️ These are a trust seal, not configuration. What the checkout actually
 * accepts is the API's `PaymentMethod` enum (docs/specs/14-footer.md).
 */

const MARKS = [
  { label: "Visa", text: "VISA" },
  { label: "Mastercard", text: "MC" },
  { label: "Pix", text: "PIX" },
  { label: "PayPal", text: "PayPal" },
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
            className="inline-flex h-8 min-w-14 items-center justify-center rounded-md border border-surface-foreground/25 bg-surface-foreground/10 px-2 text-[0.7rem] font-semibold tracking-wide text-surface-foreground/85"
          >
            {mark.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
