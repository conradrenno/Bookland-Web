import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { FormAlert } from "@/components/form/form-alert";
import { buttonVariants } from "@/components/ui/button";
import { loginFailureMessage } from "@/lib/auth/login-failure";
import { loginHref, resolveAfterAuthPath, withNextParam } from "@/lib/auth/next-path";
import { getCurrentUser } from "@/lib/auth/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta Bookland.",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ next?: string | string[]; error?: string | string[] }>;

/**
 * US-02 — the way in.
 *
 * The password is no longer typed here: it is typed on the identity service's
 * own page, which is the point of the OAuth2 flow (docs/specs/21, decision 2).
 * So this page normally renders nothing — it forwards to `/api/auth/login`,
 * which starts the flow. Old links and bookmarks to `/login?next=` keep working.
 *
 * It only shows itself when the callback sends someone back with `?error=`:
 * the reason, and a way to try again.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next, error } = await searchParams;
  // Sanitised here, before it can reach a redirect: the raw value is attacker
  // controlled (docs/specs/16-auth-pages.md).
  const destination = resolveAfterAuthPath(next);

  if (await getCurrentUser()) redirect(destination);

  const failure = loginFailureMessage(error);
  if (!failure) redirect(loginHref(destination));

  return (
    <AuthCard
      title="Entrar"
      description="Não conseguimos concluir seu login."
      footer={
        <>
          Não tem conta?{" "}
          <Link
            href={withNextParam("/register", destination)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Criar conta
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <FormAlert>{failure}</FormAlert>
        {/* A styled anchor, not a `Button` rendering one: it navigates, so a
            screen reader should hear "link". And a plain anchor rather than
            `<Link>`: the login route redirects to the identity service, which a
            client-side navigation cannot follow. */}
        <a href={loginHref(destination)} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
          Tentar de novo
        </a>
      </div>
    </AuthCard>
  );
}
