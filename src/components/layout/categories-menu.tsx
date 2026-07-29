"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CategoryViewModel } from "@/lib/api/types";

/**
 * "Categorias" in the main nav: hovering opens the list, clicking goes to the
 * full index — the behaviour spec 13 asks for.
 *
 * The trigger is a link, not a button, so the click has a destination even
 * before the menu opens (and for anyone navigating by keyboard or crawler).
 */
export function CategoriesMenu({ categories }: { categories: CategoryViewModel[] }) {
  const [open, setOpen] = useState(false);

  // Categories with no books would be dead ends in a navigation menu. The
  // /categories page still lists them — there, the count is the information.
  const navigable = categories.filter((category) => category.bookCount > 0);

  return (
    <div onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Link
              href="/categories"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:text-primary aria-expanded:text-primary"
            />
          }
        >
          Categorias
          <ChevronDown aria-hidden className="size-3.5" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          {navigable.map((category) => (
            <DropdownMenuItem
              key={category.id}
              render={<Link href={`/?category=${category.id}`} />}
            >
              <span className="flex-1">{category.name}</span>
              <span className="text-xs text-muted-foreground">{category.bookCount}</span>
            </DropdownMenuItem>
          ))}

          {navigable.length > 0 && <DropdownMenuSeparator />}

          <DropdownMenuItem render={<Link href="/categories" />}>
            Ver todas as categorias
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
