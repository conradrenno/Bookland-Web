import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { StatusTransitionViewModel } from "@/lib/api/types";
import { StatusTimeline } from "./status-timeline";

const CUSTOMER = "224d5247-205a-4c88-868b-80672a010493";

function transition(
  toStatus: StatusTransitionViewModel["toStatus"],
  changedAt: string,
  fromStatus: StatusTransitionViewModel["fromStatus"] = "CONFIRMED",
): StatusTransitionViewModel {
  return { fromStatus, toStatus, changedAt, changedBy: CUSTOMER };
}

describe("StatusTimeline", () => {
  it("reads in pt-BR, not in enum values", () => {
    render(
      <StatusTimeline
        history={[transition("CONFIRMED", "2026-07-30T19:55:57.120226Z", "AWAITING_PAYMENT")]}
      />,
    );

    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    expect(screen.queryByText("CONFIRMED")).not.toBeInTheDocument();
  });

  it("runs oldest first, whatever order the API used", () => {
    // The contract promises an order only for the admin listing; this array has
    // no stated order at all (09-contract-notes.md item 27).
    render(
      <StatusTimeline
        history={[
          transition("SHIPPED", "2026-08-02T10:00:00Z"),
          transition("CONFIRMED", "2026-07-30T19:55:57Z", "AWAITING_PAYMENT"),
          transition("DELIVERED", "2026-08-05T14:30:00Z"),
        ]}
      />,
    );

    const entries = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(entries[0]).toContain("Confirmado");
    expect(entries[1]).toContain("Enviado");
    expect(entries[2]).toContain("Entregue");
  });

  it("shows the instant in the store's timezone", () => {
    // 19:55 UTC is 16:55 in São Paulo — the formatter pins the zone, and the `Z`
    // now makes the instant unambiguous.
    render(<StatusTimeline history={[transition("CONFIRMED", "2026-07-30T19:55:57.120226Z")]} />);

    expect(screen.getByText("30/07/2026, 16:55")).toBeInTheDocument();
  });

  it("renders nothing at all when there is no history", () => {
    const { container } = render(<StatusTimeline history={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
