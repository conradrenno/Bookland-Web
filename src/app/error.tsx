"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the storefront pages.
 *
 * A Client Component by convention — React needs a component it can re-mount
 * after `reset()`. It never shows the underlying failure: an upstream message is
 * written for developers and can name internals, so the page states what the
 * visitor can do instead (docs/specs/07-ui-design.md).
 */
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server strips the message in production and leaves a digest, which is
    // the only thread back to the server log. Keep it visible in the console.
    console.error("Falha ao renderizar a página", error.digest ?? error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <h1 className="font-serif text-2xl tracking-tight">Estamos com um problema</h1>
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar esta página agora. Tente novamente em instantes.
      </p>
      <Button size="lg" onClick={reset}>
        Tentar novamente
      </Button>
    </div>
  );
}
