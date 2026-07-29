"use client";

import { ChevronDown, LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/api/auth-client";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Signed-in menu: who you are, and how to leave.
 *
 * The token carries `{ sub, email, role }` and no display name, so the trigger
 * shows the local part of the e-mail. A real name would need `GET /users/{id}`
 * on every page render — not worth it for a label (docs/specs/02-auth.md).
 *
 * "Minha conta", "Meus pedidos" and the admin entry from spec 13 land here when
 * their pages exist; linking to them now would only produce 404s.
 */
export function AccountMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const handle = user.email.split("@")[0];

  async function onSignOut() {
    setSigningOut(true);
    const result = await signOut();

    if (!result.ok) {
      // The cookies may well be gone already, but saying "signed out" when the
      // refresh token was not revoked would be a lie about the session.
      setSigningOut(false);
      toast.error("Não foi possível sair agora. Tente novamente.");
      return;
    }

    router.push("/");
    // The header is server-rendered from the cookie: without this the Router
    // Cache keeps showing the signed-in version until something else navigates.
    router.refresh();
  }

  return (
    <DropdownMenu>
      {/* `outline` plus a chevron so the control looks like something that
          opens. As a bare ghost button it read as a label, and the only way out
          of the session sat behind a click nobody had a reason to try. */}
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            aria-label={`Sua conta (${handle})`}
          />
        }
      >
        <User aria-hidden className="size-4" />
        <span className="hidden max-w-28 truncate sm:inline">{handle}</span>
        <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* The label has to sit inside a group: Base UI's GroupLabel reads a
            context that only Menu.Group provides, and throws without it. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
            {user.email}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} disabled={signingOut}>
          <LogOut aria-hidden />
          {signingOut ? "Saindo…" : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
