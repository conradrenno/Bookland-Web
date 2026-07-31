import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { server } from "@/test/msw";
import { CheckoutForm } from "./checkout-form";

const refresh = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
  usePathname: () => "/checkout",
}));

/** Same-origin route, so MSW needs an absolute URL to match it in jsdom. */
const CHECKOUT_ROUTE = "http://localhost:3000/api/cart/checkout";
const ORDER_ID = "f8bbf26e-28bb-46e0-a0a2-4aba8e674026";

const order = {
  id: ORDER_ID,
  customerId: "224d5247-205a-4c88-868b-80672a010493",
  items: [],
  status: "CONFIRMED",
  totalAmount: 139.8,
  statusHistory: [],
  createdAt: "2026-07-30T19:55:57.117193400Z",
  updatedAt: "2026-07-30T19:55:57.120226Z",
};

/** A valid card, typed the way a customer would. */
async function fillCard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: /Cartão de crédito/ }));
  await user.type(screen.getByLabelText("Número do cartão"), "4111111111111111");
  await user.type(screen.getByLabelText("Validade"), "1231");
  await user.type(screen.getByLabelText("CVV"), "123");
  await user.type(screen.getByLabelText("Nome impresso no cartão"), "João da Silva");
}

function submit() {
  return screen.getByRole("button", { name: /Pagar/ });
}

function errorRoute(status: number, code: string) {
  return http.post(CHECKOUT_ROUTE, () =>
    HttpResponse.json({ code, message: "ignored — copy comes from the code" }, { status }),
  );
}

beforeEach(() => {
  refresh.mockClear();
  push.mockClear();
});

describe("CheckoutForm", () => {
  it("sends only the payment method, never the card fields", async () => {
    // The whole reason the decorative fields are safe to have.
    const seen: { body?: unknown } = {};
    server.use(
      http.post(CHECKOUT_ROUTE, async ({ request }) => {
        seen.body = await request.json();
        return HttpResponse.json(order);
      }),
    );
    const user = userEvent.setup();
    render(<CheckoutForm total={139.8} />);

    await fillCard(user);
    await user.click(submit());

    await waitFor(() => expect(seen.body).toEqual({ paymentMethod: "CREDIT_CARD" }));
    expect(JSON.stringify(seen.body)).not.toContain("4111");
  });

  it("takes the customer to the order it just created", async () => {
    server.use(http.post(CHECKOUT_ROUTE, () => HttpResponse.json(order)));
    const user = userEvent.setup();
    render(<CheckoutForm total={139.8} />);

    await user.type(screen.getByLabelText("Chave PIX"), "joao@bookland.com");
    await user.click(submit());

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/orders/${ORDER_ID}`));
    // The header badge still counts a cart that is now an order.
    expect(refresh).toHaveBeenCalled();
  });

  it("defaults to PIX and asks for its key alone", () => {
    render(<CheckoutForm total={139.8} />);

    expect(screen.getByRole("radio", { name: "PIX" })).toBeChecked();
    expect(screen.getByLabelText("Chave PIX")).toBeInTheDocument();
    expect(screen.queryByLabelText("Número do cartão")).not.toBeInTheDocument();
  });

  it("swaps the fields when the method changes", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm total={139.8} />);

    await user.click(screen.getByRole("radio", { name: "PayPal" }));

    expect(screen.getByLabelText("E-mail do PayPal")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chave PIX")).not.toBeInTheDocument();
  });

  it("refuses to submit an empty required field", async () => {
    // Decorative, but not optional — the owner's call.
    let called = false;
    server.use(
      http.post(CHECKOUT_ROUTE, () => {
        called = true;
        return HttpResponse.json(order);
      }),
    );
    const user = userEvent.setup();
    render(<CheckoutForm total={139.8} />);

    await user.click(submit());

    expect(await screen.findByText("Informe uma chave PIX válida.")).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("refuses a card number that could not be one", async () => {
    let called = false;
    server.use(
      http.post(CHECKOUT_ROUTE, () => {
        called = true;
        return HttpResponse.json(order);
      }),
    );
    const user = userEvent.setup();
    render(<CheckoutForm total={139.8} />);

    await user.click(screen.getByRole("radio", { name: /Cartão de crédito/ }));
    await user.type(screen.getByLabelText("Número do cartão"), "1234567812345678");
    await user.type(screen.getByLabelText("Validade"), "1231");
    await user.type(screen.getByLabelText("CVV"), "123");
    await user.type(screen.getByLabelText("Nome impresso no cartão"), "João da Silva");
    await user.click(submit());

    expect(await screen.findByText("Número de cartão inválido.")).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("sends the customer back to the cart when stock ran out", async () => {
    // The 409 names no book, but the cart marks the line — so the cart is where
    // this gets explained.
    server.use(errorRoute(409, ErrorCodes.CART_ITEM_UNAVAILABLE));
    const user = userEvent.setup();
    render(<CheckoutForm total={139.8} />);

    await user.type(screen.getByLabelText("Chave PIX"), "joao@bookland.com");
    await user.click(submit());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/cart?motivo=estoque"));
  });

  it("sends the customer to the cart when it emptied elsewhere", async () => {
    server.use(errorRoute(404, ErrorCodes.CART_NOT_FOUND));
    const user = userEvent.setup();
    render(<CheckoutForm total={139.8} />);

    await user.type(screen.getByLabelText("Chave PIX"), "joao@bookland.com");
    await user.click(submit());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/cart"));
  });

  it("sends the customer to sign in when the session died", async () => {
    server.use(errorRoute(401, ErrorCodes.TOKEN_MISSING));
    const user = userEvent.setup();
    render(<CheckoutForm total={139.8} />);

    await user.type(screen.getByLabelText("Chave PIX"), "joao@bookland.com");
    await user.click(submit());

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/checkout")}`),
    );
  });

  it("explains a failure it cannot navigate away from", async () => {
    server.use(errorRoute(500, "SOMETHING_NEW_UPSTREAM"));
    const user = userEvent.setup();
    render(<CheckoutForm total={139.8} />);

    await user.type(screen.getByLabelText("Chave PIX"), "joao@bookland.com");
    await user.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Estamos com um problema. Tente novamente.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("cannot buy the same books twice", async () => {
    // Two submits fired back to back, before React can repaint the button as
    // disabled — the gap `disabled` alone cannot close, and the reason the
    // handler keeps a ref. Held open until both have been dispatched.
    let calls = 0;
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(CHECKOUT_ROUTE, async () => {
        calls += 1;
        await inFlight;
        return HttpResponse.json(order);
      }),
    );
    const user = userEvent.setup();
    render(<CheckoutForm total={139.8} />);

    await user.type(screen.getByLabelText("Chave PIX"), "joao@bookland.com");
    const form = submit().closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    release();

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(calls).toBe(1);
  });

  it("stays locked after success, through the gap before the new page paints", async () => {
    server.use(http.post(CHECKOUT_ROUTE, () => HttpResponse.json(order)));
    const user = userEvent.setup();
    render(<CheckoutForm total={139.8} />);

    await user.type(screen.getByLabelText("Chave PIX"), "joao@bookland.com");
    await user.click(submit());

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /Confirmando/ })).toBeDisabled();
  });

  it("prices the button, so the amount is visible at the moment of paying", () => {
    render(<CheckoutForm total={1234.5} />);

    expect(screen.getByRole("button", { name: /R\$.1\.234,50/ })).toBeInTheDocument();
  });
});
