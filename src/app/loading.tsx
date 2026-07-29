import { Skeleton } from "@/components/ui/skeleton";

/** Matches the grid in `page.tsx`, so the layout does not jump when data lands. */
const PLACEHOLDER_CARDS = 8;

export default function CatalogLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <Skeleton className="h-9 w-52" />
      <Skeleton className="mt-3 h-4 w-36" />
      <Skeleton className="mt-6 h-24 w-full rounded-lg" />

      <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: PLACEHOLDER_CARDS }, (_, index) => (
          <li key={index} className="flex flex-col gap-3">
            {/* Same 2:3 frame the real cover uses. */}
            <Skeleton className="aspect-2/3 w-full rounded-md" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-5 w-24" />
          </li>
        ))}
      </ul>
    </div>
  );
}
