import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { server } from "@/test/msw";
import { CancelOrderButton } from "./cancel-order-button";

const refresh = vi.fn();
const push = vi.fn();
const navigateTo = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
  usePathname: () => "/orders/45bb517d-0ac5-4044-8bac-348572d09a03",
}));

vi.mock("@/lib/navigation", () => ({ navigateTo: (href: string) => navigateTo(href) }));

const ORDER_ID = "45bb517d-0ac5-4044-8bac-348572d09a03";
/** Same-origin route, so MSW needs an absolute URL to match it in jsdom. */
const ROUTE = `http://localhost:3000/api/orders/${ORDER_ID}`;

const cancelledOrder = {
  id: ORDER_ID,
  customerId: "398bb8b1-332b-42c8-acd4-67d08e32d30e",
  items: [],
  status: "CANCELLED",
  totalAmount: 69.9,
  statusHistory: [],
  createdAt: "2026-08-05T18:17:49.830944Z",
  updatedAt: "2026-08-05T18:17:50.015242Z",
};

function renderButton() {
  return render(<CancelOrderButton orderId={ORDER_ID} totalAmount={69.9} />);
}

const openDialog = () =>
  userEvent.click(screen.getByRole("button", { name: "Cancelar pedido" }));

const confirm = () => userEvent.click(screen.getByRole("button", { name: "Sim, cancelar" }));

/** Error envelope in the shape our own route handlers send. */
function errorRoute(status: number, code: string) {
  return http.delete(ROUTE, () =>
    HttpResponse.json({ code, message: "ignored — copy comes from the code" }, { status }),
  );
}

beforeEach(() => {
  refresh.mockClear();
  push.mockClear();
});

describe("CancelOrderButton", () => {
  it("does not cancel anything until the dialog is confirmed", async () => {
    // The point of the whole component. Cancelling restores stock and refunds
    // upstream with no undo, so the trigger must be inert on its own.
    let called = false;
    server.use(
      http.delete(ROUTE, () => {
        called = true;
        return HttpResponse.json(cancelledOrder);
      }),
    );

    renderButton();
    await openDialog();

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("dismissing the dialog cancels nothing", async () => {
    let called = false;
    server.use(
      http.delete(ROUTE, () => {
        called = true;
        return HttpResponse.json(cancelledOrder);
      }),
    );

    renderButton();
    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Manter pedido" }));

    expect(called).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("names the amount being refunded, rather than asking 'are you sure?'", async () => {
    renderButton();
    await openDialog();

    expect(screen.getByRole("alertdialog")).toHaveTextContent("R$ 69,90");
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/estoque/i);
  });

  it("cancels on confirmation and re-renders the server tree", async () => {
    const seen: { method?: string } = {};
    server.use(
      http.delete(ROUTE, ({ request }) => {
        seen.method = request.method;
        return HttpResponse.json(cancelledOrder);
      }),
    );

    renderButton();
    await openDialog();
    await confirm();

    // The response carries the updated order, but the badge, timeline and
    // payment panel are all server-rendered — only a refresh moves them.
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(seen.method).toBe("DELETE");
  });

  it("sends one DELETE even when the confirm button is double-clicked", async () => {
    let calls = 0;
    server.use(
      http.delete(ROUTE, async () => {
        calls += 1;
        return HttpResponse.json(cancelledOrder);
      }),
    );

    renderButton();
    await openDialog();
    await userEvent.dblClick(screen.getByRole("button", { name: "Sim, cancelar" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(calls).toBe(1);
  });

  it("explains a 409 in place, keeping the dialog open", async () => {
    // What a slow second cancel answers. The message belongs next to the action
    // it refers to, not in a toast the customer has already looked away from.
    server.use(errorRoute(409, ErrorCodes.ORDER_CANCELLATION_NOT_ALLOWED));

    renderButton();
    await openDialog();
    await confirm();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este pedido não pode mais ser cancelado.",
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sends a dead session to the login page instead of showing a message", async () => {
    server.use(errorRoute(401, ErrorCodes.TOKEN_MISSING));

    renderButton();
    await openDialog();
    await confirm();

    await waitFor(() =>
      expect(navigateTo).toHaveBeenCalledWith(
        `/api/auth/login?next=${encodeURIComponent(`/orders/${ORDER_ID}`)}`,
      ),
    );
  });

  it("forgets a previous failure when the dialog is reopened", async () => {
    server.use(errorRoute(409, ErrorCodes.ORDER_CANCELLATION_NOT_ALLOWED));

    renderButton();
    await openDialog();
    await confirm();
    await screen.findByRole("alert");

    await userEvent.click(screen.getByRole("button", { name: "Manter pedido" }));
    await openDialog();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
