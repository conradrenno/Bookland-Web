import Link from "next/link";
import { Suspense } from "react";

import { SearchBar } from "@/components/catalog/search-bar";
import { AccountMenu } from "@/components/layout/account-menu";
import { CartButton } from "@/components/layout/cart-button";
import { CategoriesMenu } from "@/components/layout/categories-menu";
import { HeaderShell } from "@/components/layout/header-shell";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ON_SURFACE_GHOST, ON_SURFACE_PRIMARY } from "@/components/layout/on-surface";
import { Button } from "@/components/ui/button";
import { listCategories } from "@/lib/api/categories";
import type { CategoryViewModel } from "@/lib/api/types";
import { getCurrentUser } from "@/lib/auth/server";
import { safeCartItemCount } from "@/lib/cart/current-cart";
import { cn } from "@/lib/utils";

/**
 * Header on every page (docs/specs/13-common_header.md).
 *
 * A Server Component: it reads the session cookie and the category list during
 * the render, and hands both to the small client islands that need interaction.
 */
export async function SiteHeader() {
  // The cart read is memoised (`current-cart.ts`), so on `/cart` the page and
  // this badge share one upstream call instead of making two.
  const [categories, user, cartCount] = await Promise.all([
    safeCategories(),
    getCurrentUser(),
    safeCartItemCount(),
  ]);

  return (
    <HeaderShell>
      {/* Height comes from the tallest child (the 40px search field) plus this
          padding: 12px a side gave 64px, 20px gives 80px. The scale has no step
          that lands on exactly +20%, and the nearer one is up. */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-5">
        <MobileNav categories={categories} signedIn={user !== null} />

        {/* Hovers go to `accent` (gold), not `primary` (terracotta): terracotta
            on the wood surface is nearly the same value and the change would be
            invisible. Gold is the one palette colour that lifts off it. */}
        <Link href="/" className="font-serif text-xl tracking-tight hover:text-accent">
          Bookland
        </Link>

        <nav aria-label="Navegação principal" className="hidden items-center gap-1 lg:flex">
          <CategoriesMenu categories={categories} />
          <Link
            href="/?sort=rating"
            className="rounded-md px-2 py-1.5 text-sm hover:text-accent"
          >
            Mais bem avaliados
          </Link>
        </nav>

        {/* Reads the query string, so it needs a boundary of its own — otherwise
            every page that mounts this header is forced out of static rendering. */}
        <Suspense fallback={<div className="h-10 flex-1" />}>
          <SearchBar className="order-last w-full flex-1 sm:order-none sm:mx-auto sm:max-w-md" />
        </Suspense>

        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <CartButton count={cartCount} signedIn={user !== null} />

          {user ? (
            <AccountMenu user={user} />
          ) : (
            // "Entrar" shows at every width: on a narrow screen the way in
            // should not be hidden behind a menu the visitor has to discover.
            // "Criar conta" needs the room, and stays in the mobile panel.
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className={ON_SURFACE_GHOST}
                render={<Link href="/login" />}
              >
                Entrar
              </Button>
              <Button
                size="sm"
                className={cn("hidden sm:inline-flex", ON_SURFACE_PRIMARY)}
                render={<Link href="/register" />}
              >
                Criar conta
              </Button>
            </div>
          )}
        </div>
      </div>
    </HeaderShell>
  );
}

/**
 * The category list, or an empty one if the upstream is unhappy.
 *
 * The header sits in the root layout, and a layout that throws takes down every
 * page with it — including the error page. A menu that is temporarily short is a
 * far better outcome than a site-wide failure caused by a decoration.
 */
async function safeCategories(): Promise<CategoryViewModel[]> {
  try {
    return await listCategories();
  } catch {
    return [];
  }
}
