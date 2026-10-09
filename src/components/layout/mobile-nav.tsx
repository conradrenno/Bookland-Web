"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ON_SURFACE_GHOST } from "@/components/layout/on-surface";
import { Button } from "@/components/ui/button";
import type { CategoryViewModel } from "@/lib/api/types";
import { loginHref } from "@/lib/auth/next-path";

interface MobileNavProps {
  categories: CategoryViewModel[];
  signedIn: boolean;
}

/**
 * The nav, collapsed behind a button on narrow screens.
 *
 * Renders the same destinations as the desktop bar — including the categories,
 * flattened, since a hover dropdown has no meaning on touch.
 */
export function MobileNav({ categories, signedIn }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating keeps the panel mounted otherwise, so the new page would open
  // behind an open menu. Closed during render rather than in an effect, so the
  // destination never paints with the old menu still over it.
  const [openedOn, setOpenedOn] = useState(pathname);
  if (openedOn !== pathname) {
    setOpenedOn(pathname);
    setOpen(false);
  }

  const navigable = categories.filter((category) => category.bookCount > 0);

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        className={ON_SURFACE_GHOST}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        onClick={() => setOpen((previous) => !previous)}
      >
        {open ? <X aria-hidden /> : <Menu aria-hidden />}
      </Button>

      {open && (
        <div
          id="mobile-nav-panel"
          // `text-foreground` is restated because the header sets light type for
          // the wood bar, and this panel drops back onto the cream page colour —
          // inheriting from above would leave cream text on cream.
          className="absolute inset-x-0 top-full border-b border-border bg-background px-4 py-4 text-foreground shadow-md"
        >
          <nav className="flex flex-col gap-1">
            <MobileLink href="/categories">Todas as categorias</MobileLink>
            <MobileLink href="/?sort=rating">Mais bem avaliados</MobileLink>

            {navigable.length > 0 && (
              <>
                <p className="mt-3 px-2 text-xs tracking-wide text-muted-foreground uppercase">
                  Categorias
                </p>
                {navigable.map((category) => (
                  <MobileLink key={category.id} href={`/?category=${category.id}`}>
                    {category.name}
                  </MobileLink>
                ))}
              </>
            )}

            {!signedIn && (
              <>
                <hr className="my-3 border-border" />
                <MobileLink href={loginHref()} external>
                  Entrar
                </MobileLink>
                <MobileLink href="/register">Criar conta</MobileLink>
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}

/**
 * `external` renders a plain anchor: the login route redirects to the identity
 * service, which a client-side `<Link>` navigation cannot follow.
 */
function MobileLink({
  href,
  external = false,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const className = "rounded-md px-2 py-2 text-sm hover:bg-muted";
  if (external) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
