import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "@/lib/auth/session";
import { server } from "@/test/msw";
import { AccountMenu } from "./account-menu";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

/** Same-origin BFF route, absolute so MSW can match it under jsdom. */
const LOGOUT_ROUTE = "http://localhost:3000/api/auth/logout";

const USER: SessionUser = {
  id: "60375ba2-66aa-4d12-9f4b-09c659897447",
  email: "leitor@bookland.com",
  role: "CUSTOMER",
  isAdmin: false,
};

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
});

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /Sua conta/ }));
  return user;
}

describe("AccountMenu", () => {
  it("names the signed-in user with the handle from the token", () => {
    // The access token carries no display name, so the local part stands in.
    render(<AccountMenu user={USER} />);

    expect(screen.getByText("leitor")).toBeInTheDocument();
  });

  it("keeps the way out one click from the header", async () => {
    render(<AccountMenu user={USER} />);

    await openMenu();

    expect(await screen.findByRole("menuitem", { name: "Sair" })).toBeInTheDocument();
    expect(screen.getByText(USER.email)).toBeInTheDocument();
  });

  it("signs out through the BFF and refreshes the server-rendered header", async () => {
    server.use(http.post(LOGOUT_ROUTE, () => new HttpResponse(null, { status: 204 })));
    render(<AccountMenu user={USER} />);

    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Sair" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    // The header is rendered from the cookie on the server: without the refresh
    // the Router Cache keeps serving the signed-in version.
    expect(refresh).toHaveBeenCalled();
  });

  it("says so when the sign-out fails, instead of pretending it worked", async () => {
    // The cookies may already be gone, but claiming "signed out" while the
    // refresh token still lives upstream would be a lie about the session.
    server.use(
      http.post(LOGOUT_ROUTE, () =>
        HttpResponse.json({ code: "INTERNAL_ERROR", message: "boom" }, { status: 500 }),
      ),
    );
    render(<AccountMenu user={USER} />);

    const user = await openMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Sair" }));

    await waitFor(() => expect(push).not.toHaveBeenCalled());
  });
});
