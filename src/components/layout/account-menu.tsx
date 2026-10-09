"use client";

import { ChevronDown, LogOut, Package, User } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

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
import { ON_SURFACE_OUTLINE } from "@/components/layout/on-surface";
import { LOGOUT_ROUTE } from "@/lib/api/auth-client";
import type { SessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * Signed-in menu: who you are, and how to leave.
 *
 * The trigger shows the first name from the token's `name` claim, falling back
 * to the local part of the e-mail for a token that carries none.
 *
 * **Signing out is a form submission**, not a `fetch`: the BFF answers with a
 * redirect to the identity service, so that it ends its own session too, and
 * only a real navigation can follow a redirect to another origin
 * (docs/specs/21, R3). The form sits outside the menu, which is portalled and
 * unmounts on close; the menu item just submits it.
 *
 * "Meus pedidos" arrived with stage 6, once `/orders` existed. "Minha conta" and
 * the admin entry from spec 13 land here the same way — when their pages exist;
 * linking to them now would only produce 404s.
 */
export function AccountMenu({ user }: { user: SessionUser }) {
  const signOutForm = useRef<HTMLFormElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const handle = user.name?.split(/\s+/)[0] ?? user.email.split("@")[0];

  function onSignOut() {
    setSigningOut(true);
    // `requestSubmit` rather than `submit`: it goes through the form's own
    // submit path, the same as a button inside it would.
    signOutForm.current?.requestSubmit();
  }

  return (
    <>
      <form ref={signOutForm} method="post" action={LOGOUT_ROUTE} hidden aria-hidden />
      <DropdownMenu>
        {/* `outline` plus a chevron so the control looks like something that
          opens. As a bare ghost button it read as a label, and the only way out
          of the session sat behind a click nobody had a reason to try. */}
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className={cn("h-9 gap-1.5", ON_SURFACE_OUTLINE)}
              aria-label={`Sua conta (${handle})`}
            />
          }
        >
          <User aria-hidden className="size-4" />
          <span className="hidden max-w-28 truncate sm:inline">{handle}</span>
          {/* Dimmed against the light type, not against the page: this chevron
            sits on the wood bar, where `muted-foreground` would disappear. */}
          <ChevronDown aria-hidden className="size-3.5 text-surface-foreground/70" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* The label has to sit inside a group: Base UI's GroupLabel reads a
            context that only Menu.Group provides, and throws without it. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              {user.name && <span className="block truncate text-foreground">{user.name}</span>}
              <span className="block truncate text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {/* `render={<Link/>}` here, not a styled anchor: a menu item has to keep
            its `menuitem` role and the menu's keyboard handling, which is what
            `render` preserves — the opposite trade-off from the CTA buttons,
            where link semantics were the thing worth keeping. */}
          <DropdownMenuItem render={<Link href="/orders" />}>
            <Package aria-hidden />
            Meus pedidos
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSignOut} disabled={signingOut}>
            <LogOut aria-hidden />
            {signingOut ? "Saindo…" : "Sair"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
