import type { Metadata } from "next";
import Link from "next/link";

import { listCategories } from "@/lib/api/categories";

export const metadata: Metadata = {
  title: "Categorias",
  description: "Todas as categorias do catálogo da Bookland.",
};

/**
 * US-10 — every category, with how many books each holds.
 *
 * Each one links back to the catalogue filtered by it (`/?category={id}`) rather
 * than to a page of its own: the listing UI, its filters and its pager already
 * exist there, and one canonical URL per listing is better for search engines
 * than two that show the same books (docs/specs/03-catalog.md).
 */
export default async function CategoriesPage() {
  const categories = await listCategories();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-8 space-y-2">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Categorias</h1>
        <p className="text-sm text-muted-foreground">
          Escolha uma categoria para ver os títulos disponíveis.
        </p>
      </header>

      {categories.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
          Nenhuma categoria cadastrada ainda.
        </p>
      ) : (
        // Empty categories are listed here on purpose — this page is the full
        // index, and a count of zero is information. The header menu hides them,
        // where the goal is navigation rather than completeness.
        <ul className="grid gap-3 sm:grid-cols-2">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/?category=${category.id}`}
                className="flex items-baseline justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-muted"
              >
                <span className="font-serif text-lg">{category.name}</span>
                <span className="text-sm text-muted-foreground">
                  {category.bookCount === 1 ? "1 livro" : `${category.bookCount} livros`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
