import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookCover } from "@/components/catalog/book-cover";
import { RatingStars } from "@/components/catalog/rating-stars";
import { Badge } from "@/components/ui/badge";
import { getBook } from "@/lib/api/books";
import { isApiError } from "@/lib/api/errors";
import type { BookViewModel } from "@/lib/api/types";
import { isUuid } from "@/lib/api/uuid";
import { formatPrice } from "@/lib/format";

const DETAIL_COVER_SIZES = "(min-width: 768px) 20rem, 60vw";

interface BookPageProps {
  params: Promise<{ bookId: string }>;
}

/**
 * US-06 — one book.
 *
 * Reviews (docs/specs/04-reviews.md) and the add-to-cart action
 * (docs/specs/05-cart-checkout.md) render on this page too, and arrive with
 * their own stages; this is the book itself.
 */
export default async function BookPage({ params }: BookPageProps) {
  const book = await loadBook((await params).bookId);

  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <nav aria-label="Trilha" className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-primary">
          Catálogo
        </Link>
        <span aria-hidden> · </span>
        <span className="text-foreground">{book.title}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-[20rem_1fr] md:gap-12">
        <BookCover
          coverImageUrl={book.coverImageUrl}
          title={book.title}
          sizes={DETAIL_COVER_SIZES}
          priority
          className="mx-auto max-w-64 md:max-w-none"
        />

        <div className="space-y-5">
          <header className="space-y-2">
            <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
              {book.title}
            </h1>
            {book.authors.length > 0 && (
              <p className="text-lg text-muted-foreground">{book.authors.join(", ")}</p>
            )}
            <RatingStars rating={book.avgRating} />
          </header>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-3xl font-semibold text-primary">{formatPrice(book.price)}</p>
            {/* Availability, never the exact stock count: US-06 treats the
                quantity as internal information. */}
            <Badge variant={book.available ? "secondary" : "outline"}>
              {book.available ? "Em estoque" : "Indisponível"}
            </Badge>
          </div>

          {book.synopsis && (
            <section className="space-y-2">
              <h2 className="font-serif text-lg">Sinopse</h2>
              <p className="leading-relaxed text-muted-foreground">{book.synopsis}</p>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="font-serif text-lg">Ficha técnica</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Detail label="ISBN" value={book.isbn} />
              <Detail label="Editora" value={book.publisher} />
              <Detail label="Ano" value={book.publicationYear?.toString()} />
              <Detail label="Edição" value={book.edition} />
            </dl>
          </section>
        </div>
      </div>
    </article>
  );
}

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  try {
    const book = await getBook((await params).bookId);
    return {
      title: book.title,
      description: book.synopsis ?? `${book.title} — ${book.authors.join(", ")}`,
    };
  } catch {
    // Metadata must never be the thing that breaks a page; the component below
    // resolves the same call and decides what the visitor sees.
    return { title: "Livro" };
  }
}

/**
 * Fetches the book, mapping "not there" onto the 404 page.
 *
 * A malformed id is checked before calling: the upstream answers 400 for one,
 * and a link with a typo in it is a missing page, not a broken request.
 */
async function loadBook(bookId: string): Promise<BookViewModel> {
  if (!isUuid(bookId)) notFound();

  try {
    return await getBook(bookId);
  } catch (error) {
    if (isApiError(error) && error.isNotFound) notFound();
    throw error;
  }
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;

  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
