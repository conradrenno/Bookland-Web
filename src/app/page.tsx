import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { BookCard } from "@/components/catalog/book-card";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { Pagination } from "@/components/catalog/pagination";
import { Button } from "@/components/ui/button";
import { parseBookSearchParams, searchBooks, type RawSearchParams } from "@/lib/api/books";
import { listCategories } from "@/lib/api/categories";
import { hasActiveFilters } from "@/lib/catalog/search-href";
import { isSignedIn } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Catálogo",
  description:
    "Todo o catálogo da Bookland: busque por título ou autor, filtre por categoria e preço.",
};

/** Cards in the first row, which are above the fold and worth preloading. */
const PRIORITY_CARDS = 4;

interface CatalogPageProps {
  searchParams: Promise<RawSearchParams>;
}

/**
 * US-05 — the landing page *is* the catalogue.
 *
 * A Server Component: the listing has to be crawlable and shareable by URL, and
 * every control on the page works by changing the query string rather than by
 * fetching in the browser (docs/specs/03-catalog.md).
 */
export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = parseBookSearchParams(await searchParams);

  // Independent calls — the filter bar must not wait for the listing. The
  // session only decides whether each card's CTA buys or sends the visitor to
  // sign in; it is a cookie read, not a request.
  const [books, categories, signedIn] = await Promise.all([
    searchBooks(params),
    listCategories(),
    isSignedIn(),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <header className="mb-6 space-y-2">
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
          {params.q ? `Resultados para “${params.q}”` : "Catálogo"}
        </h1>
        <p className="text-sm text-muted-foreground">{describeResults(books.totalElements)}</p>
      </header>

      {/* The filters read the URL through `useSearchParams`, which needs a
          boundary of its own so the rest of the page still streams. */}
      <Suspense fallback={<div className="h-24 rounded-lg border border-border bg-card/60" />}>
        <CatalogFilters categories={categories} />
      </Suspense>

      {books.content.length === 0 ? (
        <EmptyState filtered={hasActiveFilters(params)} />
      ) : (
        <>
          <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
            {books.content.map((book, index) => (
              <li key={book.id}>
                <BookCard
                  book={book}
                  signedIn={signedIn}
                  priority={index < PRIORITY_CARDS}
                />
              </li>
            ))}
          </ul>

          <Pagination params={params} page={books.page} totalPages={books.totalPages} />
        </>
      )}
    </div>
  );
}

function describeResults(total: number): string {
  if (total === 0) return "Nenhum livro encontrado";
  return total === 1 ? "1 livro encontrado" : `${total} livros encontrados`;
}

/**
 * Nothing matched. The message differs by cause: with filters on, the way out is
 * to clear them; with none, the catalogue really is empty and offering a "clear"
 * button that changes nothing would just be confusing.
 */
function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="mt-12 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <h2 className="font-serif text-xl">Nenhum livro encontrado</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {filtered
          ? "Nenhum título corresponde à sua busca ou aos filtros aplicados. Tente termos mais amplos."
          : "Ainda não há livros no catálogo. Volte em breve."}
      </p>
      {filtered && (
        <Button variant="outline" size="lg" className="mt-2" render={<Link href="/" />}>
          Ver todo o catálogo
        </Button>
      )}
    </div>
  );
}
