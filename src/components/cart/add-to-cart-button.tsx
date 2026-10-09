"use client";

import { Check, LoaderCircle, ShoppingBag } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { addToCart } from "@/lib/api/cart-client";
import { loginHref } from "@/lib/auth/next-path";
import { navigateTo } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** How long the "added" confirmation stays before the button returns to normal. */
const CONFIRMATION_MS = 2000;

interface AddToCartButtonProps {
  bookId: string;
  /** Out-of-stock books stay on the shelf (US-05), but cannot be bought. */
  available: boolean;
  /** From the server — a Client Component cannot read the httpOnly session. */
  signedIn: boolean;
  /** `lg` on the detail page, default in the grid. */
  size?: "default" | "lg";
  /** Applied to the wrapper, which is what sizes the button; it is always `w-full` inside. */
  className?: string;
}

type Status = "idle" | "pending" | "added";

/**
 * "Adicionar ao carrinho" — the one mutation reachable from a reading page.
 *
 * Used both in the catalogue card and on the book detail page
 * (docs/specs/18-cart.md). On success it calls `router.refresh()`: the response
 * already carries the updated cart, but the header badge is rendered by a Server
 * Component, and re-running the server render is what updates it. That is the
 * whole reason this component keeps no cart state of its own.
 *
 * Always renders the same wrapper, whichever of the three states it is in, so a
 * caller's `className` means one thing and the card's reveal animation has a
 * stable box to work on.
 */
export function AddToCartButton({
  bookId,
  available,
  signedIn,
  size = "default",
  className,
}: AddToCartButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Without this, adding a book and navigating away inside the confirmation
  // window sets state on a component that is gone.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function handleClick() {
    setStatus("pending");
    setError(null);

    const result = await addToCart(bookId);

    if (result.ok) {
      setStatus("added");
      // Re-renders the server tree, which is what moves the header badge.
      router.refresh();
      timer.current = setTimeout(() => setStatus("idle"), CONFIRMATION_MS);
      return;
    }

    setStatus("idle");
    if (result.sessionExpired) {
      navigateTo(loginHref(pathname));
      return;
    }
    setError(result.message);
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {!available ? (
        <Button size={size} className="w-full" disabled>
          Indisponível
        </Button>
      ) : !signedIn ? (
        // Anonymous visitors go straight to sign-in rather than round-tripping
        // to a 401 first — same rule as the cart icon (docs/specs/13).
        // A styled anchor, not a `Button` rendering one. Passing `render={<Link/>}`
        // makes Base UI either warn about a non-native button or stamp
        // `role="button"` on the anchor — and this element navigates, so "link"
        // is what a screen reader should hear. `buttonVariants` gives it the
        // look without the wrong semantics.
        <a href={loginHref(pathname)} className={cn(buttonVariants({ size }), "w-full")}>
          <ShoppingBag aria-hidden />
          Adicionar ao carrinho
        </a>
      ) : (
        <Button
          size={size}
          className="w-full"
          onClick={handleClick}
          // Only while the request is in flight. Staying disabled through the
          // confirmation would block someone adding a second copy.
          disabled={status === "pending"}
        >
          {status === "pending" ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : status === "added" ? (
            <Check aria-hidden />
          ) : (
            <ShoppingBag aria-hidden />
          )}
          {status === "added" ? "Adicionado" : "Adicionar ao carrinho"}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-xs leading-snug text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
