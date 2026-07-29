/**
 * URL and query-string assembly. Pure functions, no I/O — kept out of the client
 * so the rules below can be tested on their own.
 */

/** Values accepted in a query string; `undefined`/`null` entries are dropped. */
export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${baseUrl}/`);
  if (query) appendQuery(url.searchParams, query);
  return url.toString();
}

function appendQuery(target: URLSearchParams, query: QueryParams): void {
  for (const [key, value] of Object.entries(query)) {
    // Arrays repeat the key (`?tag=a&tag=b`), which is what Spring binds to a List.
    for (const item of Array.isArray(value) ? value : [value]) {
      // Only `undefined`/`null` are dropped: `0` and `false` are real values —
      // `page=0` is the first page, not an absent parameter.
      if (item === undefined || item === null) continue;
      target.append(key, String(item));
    }
  }
}
