import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { SearchBar } from "@/components/catalog/search-bar";
import { AccountMenu } from "@/components/layout/account-menu";
import { CategoriesMenu } from "@/components/layout/categories-menu";
import { HeaderShell } from "@/components/layout/header-shell";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";
import { listCategories } from "@/lib/api/categories";
import type { CategoryViewModel } from "@/lib/api/types";
import { getCurrentUser } from "@/lib/auth/server";

/**
 * Header on every page (docs/specs/13-common_header.md).
 *
 * A Server Component: it reads the session cookie and the category list during
 * the render, and hands both to the small client islands that need interaction.
 */
export async function SiteHeader() {
  const [categories, user] = await Promise.all([safeCategories(), getCurrentUser()]);

  return (
    <HeaderShell>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <MobileNav categories={categories} signedIn={user !== null} />

        <Link href="/" className="font-serif text-xl tracking-tight hover:text-primary">
          Bookland
        </Link>

        <nav aria-label="Navegação principal" className="hidden items-center gap-1 lg:flex">
          <CategoriesMenu categories={categories} />
          <Link
            href="/?sort=rating"
            className="rounded-md px-2 py-1.5 text-sm hover:text-primary"
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
          <Button
            variant="ghost"
            size="icon"
            aria-label="Carrinho"
            // Anonymous visitors are bounced to sign in and sent back, since the
            // cart endpoint requires a token. The item counter arrives with the
            // cart itself in stage 5 (decided with the owner, 2026-07-29).
            render={<Link href={user ? "/cart" : "/login?next=%2Fcart"} />}
          >
            <ShoppingBag aria-hidden />
          </Button>

          {user ? (
            <AccountMenu user={user} />
          ) : (
            // "Entrar" shows at every width: on a narrow screen the way in
            // should not be hidden behind a menu the visitor has to discover.
            // "Criar conta" needs the room, and stays in the mobile panel.
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" render={<Link href="/login" />}>
                Entrar
              </Button>
              <Button size="sm" className="hidden sm:inline-flex" render={<Link href="/register" />}>
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
