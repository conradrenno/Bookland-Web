/**
 * Book cover URLs.
 *
 * `BookViewModel.coverImageUrl` is not always an absolute URL — it depends on how
 * the book got its cover (docs/specs/03-catalog.md):
 *
 * | Origin                | Stored value          | Example                            |
 * |-----------------------|-----------------------|------------------------------------|
 * | Upload via the API    | relative path         | `/media/covers/{uuid}.jpg`         |
 * | Manual entry / seed   | absolute URL          | `https://covers.openlibrary.org/…` |
 *
 * Rendered as-is, a relative path would resolve against the Next host instead of
 * the Spring one and every uploaded cover would 404. Pure data: no I/O, safe to
 * import from a Client Component.
 */

import { MEDIA_BASE_URL } from "@/lib/config";

/**
 * Only `http`/`https` count as absolute here.
 *
 * Deliberately narrow: anything else — a protocol-relative `//host/x.jpg`, a
 * `javascript:` string typed into the admin form — falls through to the branch
 * below and ends up prefixed with our own origin, so a bad value in the database
 * can never point the browser somewhere we did not choose.
 */
const ABSOLUTE_HTTP_URL = /^https?:\/\//i;

/**
 * Resolves a stored cover value into something renderable.
 *
 * Returns `null` when there is no usable cover, which is the signal for the UI to
 * draw its placeholder — never a broken image.
 */
export function resolveCoverUrl(coverImageUrl?: string | null): string | null {
  const stored = coverImageUrl?.trim();
  if (!stored) return null;
  if (ABSOLUTE_HTTP_URL.test(stored)) return stored;

  return `${MEDIA_BASE_URL}${stored.startsWith("/") ? "" : "/"}${stored}`;
}
