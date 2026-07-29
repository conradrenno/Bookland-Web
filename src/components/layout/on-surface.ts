/**
 * Button styling for controls sitting on the dark chrome (`--surface`).
 *
 * The shadcn variants assume a light surface: `ghost` hovers to `bg-muted` with
 * `text-foreground`, and `outline` fills with `bg-background` — all cream, all
 * wrong on wood. Rather than fork the variants, header controls append these,
 * and `cn`'s tailwind-merge lets the later class win.
 *
 * Kept in one place because the header, the mobile nav and the account menu all
 * need the same answer, and three copies would drift.
 */

/** Quiet control: light type, a wash of light on hover. */
export const ON_SURFACE_GHOST =
  "text-surface-foreground hover:bg-surface-foreground/15 hover:text-surface-foreground";

/** Bordered control, e.g. the account trigger — visible without shouting. */
export const ON_SURFACE_OUTLINE =
  "border-surface-foreground/30 bg-surface-foreground/10 text-surface-foreground hover:bg-surface-foreground/20 hover:text-surface-foreground";

/**
 * The one emphatic action in the header.
 *
 * Gold rather than the usual terracotta `primary`: terracotta and the wood
 * surface sit at almost the same lightness, so the button would sink into the
 * bar instead of standing out of it.
 */
export const ON_SURFACE_PRIMARY = "bg-accent text-accent-foreground hover:bg-accent/85";
