/**
 * Sanitises the `?next=` parameter the middleware attaches when it bounces an
 * anonymous visitor to `/login`.
 *
 * Redirecting to the raw value is an **open redirect**: `?next=https://evil.tld`
 * — or `//evil.tld`, which a browser reads as protocol-relative — would send a
 * user who *just authenticated* off-site, at the exact moment they are most
 * likely to trust the page. Only same-site absolute paths are allowed through.
 *
 * Pure, so the rules can be tested without a request (docs/specs/16-auth-pages.md).
 */

/** Where to land when there is no usable `next`. */
export const DEFAULT_AFTER_AUTH = "/";

/**
 * Browsers strip control characters *before* parsing a URL, so a value like
 * `"/<TAB>/evil.tld"` turns back into `"//evil.tld"` after passing a naive
 * leading-slash check. Reject them outright rather than trying to normalise.
 */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** The path to redirect to, or `null` when the value cannot be trusted. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  if (hasControlChars(raw)) return null;

  // Must be an absolute path on this site: a single leading slash, and not the
  // `//host` or `/\host` forms that browsers resolve as another origin.
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;

  return raw;
}

/**
 * Same as `safeNextPath`, collapsing an unusable value to the default landing.
 *
 * Accepts the array form too, because `?next=a&next=b` is what Next hands a page
 * when the parameter is repeated — and a repeated parameter is exactly how one
 * would try to smuggle a second value past a check that only reads the first.
 */
export function resolveAfterAuthPath(raw: string | string[] | null | undefined): string {
  if (Array.isArray(raw)) return DEFAULT_AFTER_AUTH;
  return safeNextPath(raw) ?? DEFAULT_AFTER_AUTH;
}

/**
 * Link from one auth page to the other, carrying the pending destination.
 *
 * Without it, someone bounced from `/cart` who decides to register first would
 * land on the home page afterwards, having lost where they were going.
 */
export function withNextParam(path: string, next: string): string {
  if (next === DEFAULT_AFTER_AUTH) return path;
  return `${path}?next=${encodeURIComponent(next)}`;
}
