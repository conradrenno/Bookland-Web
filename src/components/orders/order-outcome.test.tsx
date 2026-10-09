import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderStatus } from "@/lib/api/types";
import { OrderOutcome, POLL_CEILING_MS, POLL_INTERVAL_MS } from "./order-outcome";

const refresh = vi.fn();
const readOrder = vi.fn();

// One object for every render, as Next's own router is: a fresh one each time
// would restart the polling effect, which depends on it.
const router = { refresh };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/orders-client", () => ({
  readOrder: (orderId: string) => readOrder(orderId),
}));

const ORDER_ID = "f8bbf26e-28bb-46e0-a0a2-4aba8e674026";

/** What the BFF answers when polled. */
function answer(status: OrderStatus) {
  return { ok: true, data: { id: ORDER_ID, status } };
}

function renderOutcome(status: OrderStatus, statusReason: string | null = null) {
  return render(<OrderOutcome orderId={ORDER_ID} status={status} statusReason={statusReason} />);
}

/** Lets one polling interval pass, and the request it fires settle. */
async function tick(ms = POLL_INTERVAL_MS) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  readOrder.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OrderOutcome", () => {
  it("says the stock is being reserved while the order is PENDING", () => {
    renderOutcome("PENDING");

    expect(screen.getByRole("status")).toHaveTextContent("Reservando seus livros");
  });

  it("re-renders the page from the server the moment the status moves", async () => {
    readOrder.mockResolvedValue(answer("CONFIRMED"));
    renderOutcome("PENDING");

    await tick();

    expect(readOrder).toHaveBeenCalledWith(ORDER_ID);
    expect(refresh).toHaveBeenCalledTimes(1);
    // And stops asking: the new status arrives with the refreshed props.
    await tick();
    expect(readOrder).toHaveBeenCalledTimes(1);
  });

  it("keeps asking while nothing has changed", async () => {
    readOrder.mockResolvedValue(answer("PENDING"));
    renderOutcome("PENDING");

    await tick();
    await tick();
    await tick();

    expect(readOrder).toHaveBeenCalledTimes(3);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps asking through a failed poll", async () => {
    readOrder
      .mockResolvedValueOnce({ ok: false, code: "NETWORK_ERROR", message: "x", sessionExpired: false })
      .mockResolvedValue(answer("CONFIRMED"));
    renderOutcome("AWAITING_PAYMENT");

    await tick();
    await tick();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("gives up after the ceiling and promises an e-mail instead", async () => {
    readOrder.mockResolvedValue(answer("AWAITING_PAYMENT"));
    renderOutcome("AWAITING_PAYMENT");

    await tick(POLL_CEILING_MS + POLL_INTERVAL_MS);
    const calls = readOrder.mock.calls.length;

    expect(screen.getByRole("status")).toHaveTextContent("avisaremos por e-mail");
    await tick();
    expect(readOrder).toHaveBeenCalledTimes(calls);
  });

  it("spends no requests while the tab is hidden", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    readOrder.mockResolvedValue(answer("PENDING"));
    renderOutcome("PENDING");

    await tick();
    await tick();

    expect(readOrder).not.toHaveBeenCalled();
    visibility.mockRestore();
  });

  it("explains a rejected checkout and leads back to the cart", () => {
    renderOutcome("REJECTED", "Out of stock: Dom Casmurro");

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Não conseguimos reservar todos os livros.");
    expect(banner).toHaveTextContent("Out of stock: Dom Casmurro");
    expect(banner).toHaveTextContent("seus livros continuam no carrinho");
    expect(screen.getByRole("link", { name: "Voltar ao carrinho" })).toHaveAttribute(
      "href",
      "/cart",
    );
    expect(readOrder).not.toHaveBeenCalled();
  });

  it("explains a declined payment", () => {
    renderOutcome("PAYMENT_FAILED", "Card declined");

    expect(screen.getByRole("status")).toHaveTextContent("O pagamento não foi aprovado.");
  });

  it("celebrates a confirmation only for someone who waited for it", () => {
    const { rerender } = renderOutcome("PENDING");

    // What router.refresh() does: same component, new props.
    rerender(<OrderOutcome orderId={ORDER_ID} status="CONFIRMED" statusReason={null} />);

    expect(screen.getByRole("status")).toHaveTextContent("Pedido confirmado!");
  });

  it("says nothing on a later visit to a confirmed order", () => {
    const { container } = renderOutcome("CONFIRMED");

    expect(container).toBeEmptyDOMElement();
  });
});
