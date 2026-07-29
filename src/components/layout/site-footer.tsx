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
    <footer className="mt-16 border-t border-border bg-card/40">
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
          <address className="space-y-1 text-sm text-muted-foreground not-italic">
            <p>Rua das Letras, 100</p>
            <p>Centro · São Paulo — SP</p>
            <p>01000-000</p>
          </address>

          <h3 className="mt-5 mb-2 font-serif text-sm">Fale conosco</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>(11) 4000-0000</li>
            <li>(11) 90000-0000</li>
          </ul>
        </section>

        <section>
          <FooterHeading>Formas de pagamento</FooterHeading>
          <PaymentMarks />
        </section>
      </div>

      <div className="border-t border-border bg-muted/40">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="font-serif text-foreground">Bookland</span>
          <span>© {new Date().getFullYear()} Todos os direitos reservados</span>
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
    <Link href={href} className="text-muted-foreground transition-colors hover:text-primary">
      {children}
    </Link>
  );
}
