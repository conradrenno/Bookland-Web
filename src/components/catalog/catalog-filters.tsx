"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BOOK_SORTS, DEFAULT_BOOK_SORT, type BookSort } from "@/lib/api/books";
import type { CategoryViewModel } from "@/lib/api/types";
import { buildCatalogHref, hasActiveFilters } from "@/lib/catalog/search-href";
import { useCatalogParams } from "@/lib/catalog/use-catalog-params";

/** Stands in for "no category filter" — a select needs a value for that option. */
const ALL_CATEGORIES = "all";

const SORT_LABELS: Record<BookSort, string> = {
  title: "Título (A–Z)",
  price: "Menor preço",
  rating: "Melhor avaliação",
};

interface CatalogFiltersProps {
  categories: CategoryViewModel[];
}

/**
 * Category, price range and ordering for the catalogue listing.
 *
 * A client island over a server-rendered list: each control only rewrites the
 * query string, and the page re-renders on the server with the new results.
 * That keeps the catalogue itself server-rendered and shareable by URL.
 */
export function CatalogFilters({ categories }: CatalogFiltersProps) {
  const router = useRouter();
  const params = useCatalogParams();

  function go(patch: Parameters<typeof buildCatalogHref>[1]) {
    router.push(buildCatalogHref(params, patch));
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card/60 p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-category" className="text-xs text-muted-foreground">
          Categoria
        </Label>
        <Select
          value={params.category ?? ALL_CATEGORIES}
          // Base UI hands back `null` when the selection is cleared, which for a
          // filter means the same as picking "all".
          onValueChange={(value: string | null) =>
            go({ category: !value || value === ALL_CATEGORIES ? null : value })
          }
        >
          <SelectTrigger id="filter-category" className="h-9 w-full sm:w-56">
            <SelectValue>
              {(value: string) =>
                categories.find((category) => category.id === value)?.name ??
                "Todas as categorias"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>Todas as categorias</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name} ({category.bookCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PriceRange
        minPrice={params.minPrice}
        maxPrice={params.maxPrice}
        onApply={(range) => go(range)}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-sort" className="text-xs text-muted-foreground">
          Ordenar por
        </Label>
        <Select
          value={params.sort ?? DEFAULT_BOOK_SORT}
          onValueChange={(value: string | null) => go({ sort: value ?? DEFAULT_BOOK_SORT })}
        >
          <SelectTrigger id="filter-sort" className="h-9 w-full sm:w-48">
            <SelectValue>
              {(value: string) => SORT_LABELS[value as BookSort] ?? SORT_LABELS.title}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {BOOK_SORTS.map((sort) => (
              <SelectItem key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasActiveFilters(params) && (
        <Button variant="ghost" size="sm" className="sm:ml-auto" render={<Link href="/" />}>
          <X aria-hidden />
          Limpar filtros
        </Button>
      )}
    </div>
  );
}

interface PriceRangeProps {
  minPrice?: number;
  maxPrice?: number;
  onApply: (range: { minPrice: number | null; maxPrice: number | null }) => void;
}

/**
 * The price bounds, applied together on submit.
 *
 * Deliberately not applied on change: a partially typed "1" out of "150" would
 * fire a query for everything above one real, and the intermediate results are
 * noise the visitor never asked for.
 */
function PriceRange({ minPrice, maxPrice, onApply }: PriceRangeProps) {
  const [min, setMin] = useState(minPrice?.toString() ?? "");
  const [max, setMax] = useState(maxPrice?.toString() ?? "");

  // Re-sync with the URL during render, not in an effect: clearing the filters
  // elsewhere has to empty these inputs, and doing it after paint would show the
  // old bounds for a frame. See the same pattern in `search-bar.tsx`.
  const [syncedRange, setSyncedRange] = useState({ minPrice, maxPrice });
  if (syncedRange.minPrice !== minPrice || syncedRange.maxPrice !== maxPrice) {
    setSyncedRange({ minPrice, maxPrice });
    setMin(minPrice?.toString() ?? "");
    setMax(maxPrice?.toString() ?? "");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply({
      // The parser drops anything unusable, so a typo here narrows nothing
      // rather than reaching the upstream and coming back a 400.
      minPrice: min.trim() === "" ? null : Number(min),
      maxPrice: max.trim() === "" ? null : Number(max),
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-min-price" className="text-xs text-muted-foreground">
          Preço mínimo
        </Label>
        <Input
          id="filter-min-price"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="R$ 0"
          value={min}
          onChange={(event) => setMin(event.target.value)}
          className="h-9 w-24"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filter-max-price" className="text-xs text-muted-foreground">
          Preço máximo
        </Label>
        <Input
          id="filter-max-price"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="R$ 999"
          value={max}
          onChange={(event) => setMax(event.target.value)}
          className="h-9 w-24"
        />
      </div>
      <Button type="submit" variant="outline" size="sm" className="h-9">
        Aplicar
      </Button>
    </form>
  );
}
