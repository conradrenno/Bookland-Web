import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/msw";
import { LoginForm } from "./login-form";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

/** Same-origin route, so MSW needs an absolute URL to match it in jsdom. */
const LOGIN_ROUTE = "http://localhost:3000/api/auth/login";

beforeEach(() => {
  replace.mockClear();
  refresh.mockClear();
});

async function fillAndSubmit(email = "leitor@bookland.com", password = "senha1234") {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("E-mail"), email);
  await user.type(screen.getByLabelText("Senha"), password);
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  return user;
}

describe("LoginForm", () => {
  it("sends the user to the sanitised destination on success", async () => {
    server.use(http.post(LOGIN_ROUTE, () => HttpResponse.json({ user: null })));
    render(<LoginForm next="/cart" />);

    await fillAndSubmit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cart"));
    // Without the refresh the destination could come from the Router Cache,
    // rendered while the session did not exist yet.
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a generic banner for wrong credentials, blaming neither field", async () => {
    // Pointing at the wrong field would let an attacker enumerate accounts.
    server.use(
      http.post(LOGIN_ROUTE, () =>
        HttpResponse.json({ code: "INVALID_CREDENTIALS", message: "Bad credentials" }, { status: 401 }),
      ),
    );
    render(<LoginForm next="/" />);

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail ou senha incorretos.");
    expect(screen.getByLabelText("E-mail")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Senha")).not.toHaveAttribute("aria-invalid");
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not call the BFF when the form is empty", async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/" />);

    // No MSW handler registered: a request here would fail the suite outright.
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Informe seu e-mail.")).toBeInTheDocument();
    expect(screen.getByText("Informe sua senha.")).toBeInTheDocument();
  });

  it("rejects a malformed e-mail before sending anything", async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/" />);

    await user.type(screen.getByLabelText("E-mail"), "leitor@");
    await user.type(screen.getByLabelText("Senha"), "senha1234");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Informe um e-mail válido.")).toBeInTheDocument();
  });

  it("sends one request even when the button is clicked twice", async () => {
    let calls = 0;
    server.use(
      http.post(LOGIN_ROUTE, async () => {
        calls += 1;
        // Hold the response open so the second click lands mid-flight.
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json({ user: null });
      }),
    );
    render(<LoginForm next="/" />);

    const user = await fillAndSubmit();
    await user.click(screen.getByRole("button", { name: "Entrando…" }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(calls).toBe(1);
  });

  it("explains a connectivity failure instead of showing a blank form", async () => {
    server.use(http.post(LOGIN_ROUTE, () => HttpResponse.error()));
    render(<LoginForm next="/" />);

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível conectar. Verifique sua internet e tente novamente.",
    );
  });

  it("falls back to generic copy when the BFF returns something unreadable", async () => {
    server.use(
      http.post(LOGIN_ROUTE, () => new HttpResponse("<html>502</html>", { status: 502 })),
    );
    render(<LoginForm next="/" />);

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Estamos com um problema. Tente novamente.",
    );
  });
});
