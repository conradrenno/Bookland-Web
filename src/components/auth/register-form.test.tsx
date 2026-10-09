import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/msw";
import { RegisterForm } from "./register-form";

const navigateTo = vi.fn();

vi.mock("@/lib/navigation", () => ({ navigateTo: (href: string) => navigateTo(href) }));

const REGISTER_ROUTE = "http://localhost:3000/api/auth/register";

const VALID = {
  name: "Ana Leitora",
  email: "ana@bookland.com",
  password: "senha1234",
};

beforeEach(() => {
  navigateTo.mockClear();
});

async function fill(overrides: Partial<typeof VALID & { confirmPassword: string }> = {}) {
  const values = { ...VALID, confirmPassword: VALID.password, ...overrides };
  const user = userEvent.setup();

  await user.type(screen.getByLabelText("Nome"), values.name);
  await user.type(screen.getByLabelText("E-mail"), values.email);
  await user.type(screen.getByLabelText("Senha"), values.password);
  await user.type(screen.getByLabelText("Confirmar senha"), values.confirmPassword);

  return user;
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole("button", { name: "Criar conta" }));
}

describe("RegisterForm", () => {
  it("sends the new account through the login, keeping the destination", async () => {
    // The identity service issues no token on registration (docs/specs/21).
    server.use(http.post(REGISTER_ROUTE, () => new HttpResponse(null, { status: 201 })));
    render(<RegisterForm next="/checkout" />);

    await submit(await fill());

    await waitFor(() =>
      expect(navigateTo).toHaveBeenCalledWith("/api/auth/login?next=%2Fcheckout"),
    );
  });

  it("never sends confirmPassword, which is not in the contract", async () => {
    let body: unknown;
    server.use(
      http.post(REGISTER_ROUTE, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 201 });
      }),
    );
    render(<RegisterForm next="/" />);

    await submit(await fill());

    await waitFor(() => expect(navigateTo).toHaveBeenCalled());
    expect(body).toEqual(VALID);
  });

  it("puts a duplicate e-mail on the e-mail field, not in a banner", async () => {
    // The user has to change that specific value (docs/specs/02-auth.md).
    server.use(
      http.post(REGISTER_ROUTE, () =>
        HttpResponse.json(
          { code: "EMAIL_ALREADY_EXISTS", message: "E-mail already registered" },
          { status: 409 },
        ),
      ),
    );
    render(<RegisterForm next="/" />);

    await submit(await fill());

    expect(await screen.findByText("Este e-mail já está cadastrado.")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("blocks a password with no digit before contacting the BFF", async () => {
    // No MSW handler: a request would fail the suite.
    render(<RegisterForm next="/" />);

    await submit(await fill({ password: "senhasegura", confirmPassword: "senhasegura" }));

    expect(
      await screen.findByText("A senha precisa de 8 a 72 caracteres e ao menos um número."),
    ).toBeInTheDocument();
  });

  it("blocks a password shorter than 8 characters", async () => {
    render(<RegisterForm next="/" />);

    await submit(await fill({ password: "abc123", confirmPassword: "abc123" }));

    expect(
      await screen.findByText("A senha precisa de 8 a 72 caracteres e ao menos um número."),
    ).toBeInTheDocument();
  });

  it("catches a mistyped confirmation, since the API has no password reset", async () => {
    render(<RegisterForm next="/" />);

    await submit(await fill({ confirmPassword: "senha12345" }));

    expect(await screen.findByText("As senhas não coincidem.")).toBeInTheDocument();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("places server-side validation messages on the right fields", async () => {
    server.use(
      http.post(REGISTER_ROUTE, () =>
        HttpResponse.json(
          {
            code: "VALIDATION_ERROR",
            message: "Validation failed",
            fieldErrors: { password: ["size must be between 8 and 72"] },
          },
          { status: 400 },
        ),
      ),
    );
    render(<RegisterForm next="/" />);

    await submit(await fill());

    expect(await screen.findByText("size must be between 8 and 72")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows the password rule up front rather than only after a failure", async () => {
    render(<RegisterForm next="/" />);

    expect(
      screen.getByText("A senha precisa de 8 a 72 caracteres e ao menos um número."),
    ).toBeInTheDocument();
  });
});
