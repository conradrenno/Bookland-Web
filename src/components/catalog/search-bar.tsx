"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { buildCatalogHref } from "@/lib/catalog/search-href";
import { useCatalogParams } from "@/lib/catalog/use-catalog-params";
import { cn } from "@/lib/utils";

/**
 * US-05 — search by title or author.
 *
 * A real `<form>`, not a keystroke handler: submitting on Enter is what a search
 * field is expected to do, and searching per keystroke would fire a server
 * render for every letter typed. The result page is rendered on the server, so
 * the input only has to change the URL.
 */
export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const params = useCatalogParams();
  const [term, setTerm] = useState(params.q ?? "");

  // Keeps the field honest when the URL changes underneath it — the back button,
  // or a "clear filters" link — instead of stranding the last thing typed.
  // Adjusted during render rather than in an effect: React re-runs this pass
  // before touching the DOM, so the input never flashes the stale term.
  const [syncedTerm, setSyncedTerm] = useState(params.q);
  if (syncedTerm !== params.q) {
    setSyncedTerm(params.q);
    setTerm(params.q ?? "");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Trimmed here as well as in the parser: an all-spaces term should clear the
    // search rather than travel to the server as a filter that matches nothing.
    router.push(buildCatalogHref(params, { q: term.trim() || null }));
  }

  return (
    <form role="search" onSubmit={onSubmit} className={cn("relative w-full", className)}>
      <label htmlFor="catalog-search" className="sr-only">
        Buscar livros por título ou autor
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id="catalog-search"
        type="search"
        name="q"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Buscar por título ou autor"
        className="h-10 rounded-full pl-9"
      />
    </form>
  );
}
