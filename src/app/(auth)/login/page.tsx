import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { resolveAfterAuthPath, withNextParam } from "@/lib/auth/next-path";
import { getCurrentUser } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta Bookland.",
};

/** The middleware appends `?next=` when it bounces someone off a protected page. */
type SearchParams = Promise<{ next?: string | string[] }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  // Sanitised here, before it can reach a redirect: the raw value is attacker
  // controlled (docs/specs/16-auth-pages.md).
  const destination = resolveAfterAuthPath(next);

  // Already signed in — send them on instead of showing a form they do not need.
  if (await getCurrentUser()) redirect(destination);

  return (
    <AuthCard
      title="Entrar"
      description="Bem-vindo de volta à sua livraria."
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
      <LoginForm next={destination} />
    </AuthCard>
  );
}
