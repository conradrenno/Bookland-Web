import Link from "next/link";

import { PaymentMarks } from "@/components/layout/payment-marks";

/**
 * Footer on every page (docs/specs/14-footer.md).
 *
 * Static and server-rendered — the only interaction is following a link. The
 * address and phone numbers are deliberate placeholders until the owner
 * supplies the real ones.
 */
export function SiteFooter() {
  return (
    // Same wood as the header, so the page sits between two matching bands, and
    // light type set once at the top for everything inside to inherit.
    <footer className="mt-16 bg-surface text-surface-foreground">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:grid-cols-3">
        <section>
          <FooterHeading>Mapa do site</FooterHeading>
          <ul className="space-y-2 text-sm">
            <li>
              <FooterLink href="/categories">Categorias</FooterLink>
            </li>
            <li>
              <FooterLink href="/?sort=rating">Mais bem avaliados</FooterLink>
            </li>
          </ul>
        </section>

        <section>
          <FooterHeading>Endereço</FooterHeading>
          {/* `surface-muted`, not `muted-foreground`: the latter is a mid brown
              meant for cream backgrounds and would be barely legible here. */}
          <address className="space-y-1 text-sm text-surface-muted not-italic">
            <p>Rua das Letras, 100</p>
            <p>Centro · São Paulo — SP</p>
            <p>01000-000</p>
          </address>

          <h3 className="mt-5 mb-2 font-serif text-sm">Fale conosco</h3>
          <ul className="space-y-1 text-sm text-surface-muted">
            <li>(11) 4000-0000</li>
            <li>(11) 90000-0000</li>
          </ul>
        </section>

        <section>
          <FooterHeading>Formas de pagamento</FooterHeading>
          <PaymentMarks />
        </section>
      </div>

      {/* The closing line of the page: near-black, with its own light
          foreground. Both colours travel together as tokens so the pairing
          cannot drift apart and leave dark type on a dark bar. */}
      <div className="bg-ink text-ink-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-5 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="font-serif">Bookland</span>
          <span className="text-ink-foreground/70">
            © {new Date().getFullYear()} Todos os direitos reservados
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 font-serif text-base">{children}</h2>;
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-surface-muted transition-colors hover:text-accent">
      {children}
    </Link>
  );
}
