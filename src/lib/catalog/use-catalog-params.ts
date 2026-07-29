"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { parseBookSearchParams } from "@/lib/api/books";
import type { BookSearchParams } from "@/lib/api/types";
import { searchParamsToRecord } from "./search-href";

/**
 * The active catalogue parameters, read from the URL by a Client Component.
 *
 * Lets the search bar and the filters build their next href from the current
 * one without the page having to thread props down through the header. Runs the
 * same parser the server used, so both sides agree on what the URL means.
 *
 * ⚠️ `useSearchParams` opts the nearest boundary out of static rendering — every
 * caller must sit under a `<Suspense>`, or `next build` fails on the pages that
 * would otherwise prerender.
 */
export function useCatalogParams(): BookSearchParams {
  const searchParams = useSearchParams();

  return useMemo(
    () => parseBookSearchParams(searchParamsToRecord(new URLSearchParams(searchParams))),
    [searchParams],
  );
}
