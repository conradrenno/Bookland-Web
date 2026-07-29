"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { CategoryViewModel } from "@/lib/api/types";

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
          className="absolute inset-x-0 top-full border-b border-border bg-background px-4 py-4 shadow-md"
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
                <MobileLink href="/login">Entrar</MobileLink>
                <MobileLink href="/register">Criar conta</MobileLink>
              </>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}

function MobileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-2 py-2 text-sm hover:bg-muted">
      {children}
    </Link>
  );
}
