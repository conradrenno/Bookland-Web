import Link from "next/link";

/**
 * Frame for `/login` and `/register`.
 *
 * A route group (`(auth)`) rather than a path segment: the two pages share this
 * shell without `/auth` appearing in the URL, and they stay outside the
 * storefront header that arrives with the catalogue (docs/specs/13-common_header.md).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
      <Link
        href="/"
        className="font-serif text-3xl tracking-tight text-foreground transition-colors hover:text-primary"
      >
        Bookland
      </Link>
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
