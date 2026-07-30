import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import type { CartItemViewModel } from "@/lib/api/types";
import { server } from "@/test/msw";
import { CartLine } from "./cart-line";

const refresh = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
  usePathname: () => "/cart",
}));

const BOOK_ID = "92d3c8cb-443a-4501-a593-017bdc843196";
/** Same-origin route, so MSW needs an absolute URL to match it in jsdom. */
const ITEM_ROUTE = `http://localhost:3000/api/cart/items/${BOOK_ID}`;

const ITEM: CartItemViewModel = {
  bookId: BOOK_ID,
  title: "Clean Code",
  coverImageUrl: "https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg",
  quantity: 2,
  unitPrice: 44.9,
  subtotal: 89.8,
  available: true,
};

const cart = {
  id: "13bab7e3-f756-4f63-9a64-edffb25ad6a2",
  customerId: "eee6a6d1-b523-473d-b0e6-992ad0e30fa7",
  items: [],
  total: 0,
  updatedAt: "2026-07-29T22:09:28.0627129",
};

function renderLine(overrides: Partial<CartItemViewModel> = {}) {
  return render(
    <ul>
      <CartLine item={{ ...ITEM, ...overrides }} />
    </ul>,
  );
}

/** Error envelope in the shape our own route handlers send. */
function errorRoute(method: "patch" | "delete", status: number, code: string) {
  return http[method](ITEM_ROUTE, () =>
    HttpResponse.json({ code, message: "ignored — copy comes from the code" }, { status }),
  );
}

beforeEach(() => {
  refresh.mockClear();
  push.mockClear();
});

describe("CartLine", () => {
  it("shows the book, its unit price and its subtotal", () => {
    renderLine();

    expect(screen.getByRole("link", { name: "Clean Code" })).toHaveAttribute(
      "href",
      `/books/${BOOK_ID}`,
    );
    // The `.` stands in for pt-BR's non-breaking separator.
    expect(screen.getByText(/^R\$.44,90/)).toBeInTheDocument();
    expect(screen.getByText(/^R\$.89,80$/)).toBeInTheDocument();
  });

  it("patches the exact new quantity and re-renders the server tree", async () => {
    const seen: { body?: unknown } = {};
    server.use(
      http.patch(ITEM_ROUTE, async ({ request }) => {
        seen.body = await request.json();
        return HttpResponse.json(cart);
      }),
    );
    renderLine();

    await userEvent.click(screen.getByRole("button", { name: /Aumentar quantidade/ }));

    expect(seen.body).toEqual({ quantity: 3 });
    // The line keeps no cart of its own: `refresh()` is what brings the new
    // numbers down — here and in the header badge.
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("removes the line by patching zero when the last copy is stepped away", async () => {
    const seen: { body?: unknown } = {};
    server.use(
      http.patch(ITEM_ROUTE, async ({ request }) => {
        seen.body = await request.json();
        return HttpResponse.json(cart);
      }),
    );
    renderLine({ quantity: 1 });

    // Scoped to the stepper: at one copy its "−" and the line's own remove
    // button do the same thing, so they carry the same name.
    const stepper = screen.getByRole("group", { name: /Quantidade de Clean Code/ });
    await userEvent.click(
      within(stepper).getByRole("button", { name: "Remover Clean Code do carrinho" }),
    );

    expect(seen.body).toEqual({ quantity: 0 });
  });

  it("drops the whole line in one call, however many copies it holds", async () => {
    // Otherwise a line of three costs three clicks and three round-trips.
    let deletes = 0;
    server.use(
      http.delete(ITEM_ROUTE, () => {
        deletes += 1;
        return HttpResponse.json(cart);
      }),
    );
    renderLine({ quantity: 3 });

    await userEvent.click(screen.getByRole("button", { name: /^Remover Clean Code/ }));

    await waitFor(() => expect(deletes).toBe(1));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("puts a stock error on the line that caused it", async () => {
    // Not a page banner: with several lines, a banner cannot say which book.
    server.use(errorRoute("patch", 409, ErrorCodes.CART_ITEM_UNAVAILABLE));
    renderLine();

    await userEvent.click(screen.getByRole("button", { name: /Aumentar quantidade/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não temos essa quantidade em estoque.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sends the visitor to sign in when the session died mid-page", async () => {
    server.use(errorRoute("patch", 401, ErrorCodes.TOKEN_MISSING));
    renderLine();

    await userEvent.click(screen.getByRole("button", { name: /Aumentar quantidade/ }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/cart")}`),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cannot fire a second request while the first is in flight", async () => {
    // `PATCH` on a line that vanished answers 404 BOOK_NOT_IN_CART, so a double
    // click on the removal step is a real error — not a harmless repeat.
    let calls = 0;
    server.use(
      http.patch(ITEM_ROUTE, async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(cart);
      }),
    );
    renderLine();

    const plus = screen.getByRole("button", { name: /Aumentar quantidade/ });
    await userEvent.click(plus);
    await userEvent.click(plus);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(calls).toBe(1);
  });

  it("flags a book that ran out and refuses to add more of it", () => {
    renderLine({ available: false });

    expect(screen.getByText("Indisponível")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Aumentar quantidade/ })).toBeDisabled();
    // Removing it is exactly what the visitor should still be able to do.
    expect(screen.getByRole("button", { name: /^Remover Clean Code/ })).not.toBeDisabled();
  });
});
