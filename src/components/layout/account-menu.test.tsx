import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "@/lib/auth/session";
import { AccountMenu } from "./account-menu";

const USER: SessionUser = {
  id: "60375ba2-66aa-4d12-9f4b-09c659897447",
  email: "leitor@bookland.com",
  name: "Ana Lúcia Prado",
  role: "CUSTOMER",
  isAdmin: false,
};

afterEach(() => vi.restoreAllMocks());

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Sua conta/ }));
  return user;
}

describe("AccountMenu", () => {
  it("greets the signed-in user by first name", () => {
    render(<AccountMenu user={USER} />);

    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("falls back to the e-mail handle for a token without a name", () => {
    // Sessions that predate the `name` claim carry none until their next refresh.
    render(<AccountMenu user={{ ...USER, name: null }} />);

    expect(screen.getByText("leitor")).toBeInTheDocument();
  });

  it("keeps the way out one click from the header", async () => {
    render(<AccountMenu user={USER} />);

    await openMenu();

    expect(await screen.findByRole("menuitem", { name: "Sair" })).toBeInTheDocument();
    expect(screen.getByText(USER.email)).toBeInTheDocument();
    expect(screen.getByText(USER.name!)).toBeInTheDocument();
  });

  it("links to the order history, keeping menu semantics", async () => {
    // It stays a `menuitem` — the menu's keyboard handling depends on the role,
    // so this is the one place where `render={<Link/>}` beats a styled anchor.
    render(<AccountMenu user={USER} />);

    await openMenu();

    const orders = await screen.findByRole("menuitem", { name: "Meus pedidos" });
    expect(orders).toHaveAttribute("href", "/orders");
  });

  it("signs out by submitting a POST form, not with fetch", async () => {
    // The BFF answers with a redirect to the identity service, another origin:
    // only a real navigation can follow it (docs/specs/21, R3).
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "requestSubmit")
      .mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = render(<AccountMenu user={USER} />);

    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Sair" }));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    const form = container.querySelector("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/auth/logout");
  });
});
