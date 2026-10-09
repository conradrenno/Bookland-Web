import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { ON_SURFACE_GHOST } from "@/components/layout/on-surface";
import { buttonVariants } from "@/components/ui/button";
import { loginHref } from "@/lib/auth/next-path";
import { cn } from "@/lib/utils";

/** Above this the badge would outgrow the icon; nobody needs the exact number there. */
const MAX_BADGE_COUNT = 99;

interface CartButtonProps {
  /** Sum of the quantities, not the number of lines. `0` hides the badge. */
  count: number;
  signedIn: boolean;
}

/**
 * The cart icon in the header, with the item counter (docs/specs/13-common_header.md).
 *
 * A Server Component with no state of its own: the count arrives as a prop from
 * `SiteHeader`, and every mutation ends in `router.refresh()`, which re-renders
 * the layout — that is what moves this badge.
 *
 * Anonymous visitors are sent to sign in and bounced back, since the cart
 * endpoint needs a token; they get no badge, and neither does a signed-in
 * visitor with an empty cart, because a "0" tells them nothing.
 */
export function CartButton({ count, signedIn }: CartButtonProps) {
  const showBadge = signedIn && count > 0;
  const label = showBadge ? `Carrinho, ${describeItems(count)}` : "Carrinho";
  const className = cn(
    buttonVariants({ variant: "ghost", size: "icon" }),
    "relative",
    ON_SURFACE_GHOST,
  );

  // A styled link, not a `Button` rendering one: this element navigates, so a
  // screen reader has to hear "link". Same call as the card's CTA
  // (docs/specs/18-cart.md) — `Button render={<Link/>}` either warns about a
  // non-native button or stamps `role="button"` on the anchor.
  if (!signedIn) {
    // A plain anchor: the login route redirects to the identity service, which
    // a client-side `<Link>` navigation cannot follow.
    return (
      <a href={loginHref("/cart")} aria-label={label} className={className}>
        <ShoppingBag aria-hidden />
      </a>
    );
  }

  return (
    <Link href="/cart" aria-label={label} className={className}>
      <ShoppingBag aria-hidden />
      {showBadge && (
        // Gold, not terracotta: `primary` and the wood surface sit at nearly the
        // same lightness, so the badge would disappear into the bar.
        // `aria-hidden` because the link's own label already says the number —
        // without it a screen reader announces the count twice.
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-[0.625rem] leading-4 font-semibold text-accent-foreground tabular-nums"
        >
          {count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : count}
        </span>
      )}
    </Link>
  );
}

function describeItems(count: number): string {
  return count === 1 ? "1 item" : `${count} itens`;
}
