import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";
import { loginHref, resolveAfterAuthPath } from "@/lib/auth/next-path";
import { getCurrentUser } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Criar conta",
  description: "Crie sua conta na livraria Bookland.",
};

type SearchParams = Promise<{ next?: string | string[] }>;

export default async function RegisterPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  const destination = resolveAfterAuthPath(next);

  if (await getCurrentUser()) redirect(destination);

  return (
    <AuthCard
      title="Criar conta"
      description="Leva menos de um minuto."
      footer={
        <>
          Já tem conta?{" "}
          {/* A plain anchor: the login route redirects to the identity service,
              which a client-side `<Link>` navigation cannot follow. */}
          <a
            href={loginHref(destination)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Entrar
          </a>
        </>
      }
    >
      <RegisterForm next={destination} />
    </AuthCard>
  );
}
