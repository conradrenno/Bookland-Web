"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Sticky frame for the header, with a hairline shadow once the page moves.
 *
 * Client-side only because it reacts to scroll; the header's actual content
 * stays a Server Component and is passed straight through as children, so
 * nothing else in it ships to the browser.
 */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    // Read once on mount: a reload halfway down the page starts scrolled.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        // Dark wood, so `text-surface-foreground` is set once here and every
        // child inherits light type. Anything inside that hard-codes
        // `text-foreground` would go dark-on-dark and vanish.
        "sticky top-0 z-40 border-b border-ink/25 bg-surface/95 text-surface-foreground backdrop-blur-sm transition-shadow",
        scrolled && "shadow-sm",
      )}
    >
      {children}
    </header>
  );
}
