import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuantityStepper } from "./quantity-stepper";

const TITLE = "Clean Code";

function renderStepper(props: Partial<Parameters<typeof QuantityStepper>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <QuantityStepper quantity={2} onChange={onChange} itemLabel={TITLE} {...props} />,
  );
  return { onChange };
}

describe("QuantityStepper", () => {
  it("sends the new absolute quantity, not a delta", async () => {
    // `PATCH /cart/items/{id}` sets the line; sending "+1" would double-count
    // against a cart the visitor changed in another tab.
    const { onChange } = renderStepper({ quantity: 2 });

    await userEvent.click(screen.getByRole("button", { name: `Aumentar quantidade de ${TITLE}` }));

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("steps down", async () => {
    const { onChange } = renderStepper({ quantity: 3 });

    await userEvent.click(screen.getByRole("button", { name: `Diminuir quantidade de ${TITLE}` }));

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("turns the last step down into a removal", async () => {
    // The contract's `minimum: 0` deletes the line, so the stepper needs no
    // separate path — but the control must *say* it removes, or the visitor
    // loses the book without warning.
    const { onChange } = renderStepper({ quantity: 1 });

    const minus = screen.getByRole("button", { name: `Remover ${TITLE} do carrinho` });
    await userEvent.click(minus);

    expect(onChange).toHaveBeenCalledWith(0);
    expect(
      screen.queryByRole("button", { name: `Diminuir quantidade de ${TITLE}` }),
    ).not.toBeInTheDocument();
  });

  it("locks both controls while a request is in flight", async () => {
    const { onChange } = renderStepper({ busy: true });

    const plus = screen.getByRole("button", { name: `Aumentar quantidade de ${TITLE}` });
    expect(plus).toBeDisabled();
    expect(screen.getByRole("button", { name: `Diminuir quantidade de ${TITLE}` })).toBeDisabled();

    await userEvent.click(plus);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lets an out-of-stock line shrink but not grow", () => {
    // Asking for more of a book that ran out only earns a 409 round-trip.
    renderStepper({ canIncrease: false, quantity: 2 });

    expect(screen.getByRole("button", { name: `Aumentar quantidade de ${TITLE}` })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: `Diminuir quantidade de ${TITLE}` }),
    ).not.toBeDisabled();
  });

  it("names the group after the book, since a cart has several", () => {
    renderStepper();

    expect(screen.getByRole("group", { name: `Quantidade de ${TITLE}` })).toBeInTheDocument();
  });
});
