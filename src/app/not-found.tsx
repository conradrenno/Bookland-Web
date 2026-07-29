import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="font-serif text-5xl text-muted-foreground">404</p>
      <h1 className="font-serif text-2xl tracking-tight">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">
        O endereço não existe ou o título saiu do catálogo.
      </p>
      <Button size="lg" className="mt-2" render={<Link href="/" />}>
        Voltar ao catálogo
      </Button>
    </div>
  );
}
