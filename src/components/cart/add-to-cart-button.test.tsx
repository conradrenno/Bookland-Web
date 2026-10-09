import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { server } from "@/test/msw";
import { AddToCartButton } from "./add-to-cart-button";

const refresh = vi.fn();
const push = vi.fn();
const navigateTo = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
  usePathname: () => "/books/92d3c8cb-443a-4501-a593-017bdc843196",
}));

vi.mock("@/lib/navigation", () => ({ navigateTo: (href: string) => navigateTo(href) }));

/** Same-origin route, so MSW needs an absolute URL to match it in jsdom. */
const ITEMS_ROUTE = "http://localhost:3000/api/cart/items";
const BOOK_ID = "92d3c8cb-443a-4501-a593-017bdc843196";

const cart = {
  id: "13bab7e3-f756-4f63-9a64-edffb25ad6a2",
  customerId: "eee6a6d1-b523-473d-b0e6-992ad0e30fa7",
  items: [],
  total: 0,
  updatedAt: "2026-07-30T19:55:56.993067Z",
};

function renderButton(props: Partial<Parameters<typeof AddToCartButton>[0]> = {}) {
  return render(
    <AddToCartButton bookId={BOOK_ID} available signedIn {...props} />,
  );
}

function clickCta() {
  return userEvent.click(screen.getByRole("button", { name: /Adicionar ao carrinho/ }));
}

/** Error envelope in the shape our own route handlers send. */
function errorRoute(status: number, code: string) {
  return http.post(ITEMS_ROUTE, () =>
    HttpResponse.json({ code, message: "ignored — copy comes from the code" }, { status }),
  );
}

beforeEach(() => {
  refresh.mockClear();
  push.mockClear();
});

describe("AddToCartButton", () => {
  it("adds the book and re-renders the server tree", async () => {
    const seen: { body?: unknown } = {};
    server.use(
      http.post(ITEMS_ROUTE, async ({ request }) => {
        seen.body = await request.json();
        return HttpResponse.json(cart);
      }),
    );

    renderButton();
    await clickCta();

    // `refresh()` is not decoration: the header badge is server-rendered, so
    // this is the only thing that updates it.
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    // `quantity` is left off the wire; the route handler is what defaults it.
    expect(seen.body).toEqual({ bookId: BOOK_ID });
  });

  it("confirms on the button itself, since the badge is far away", async () => {
    server.use(http.post(ITEMS_ROUTE, () => HttpResponse.json(cart)));
    renderButton();

    await clickCta();

    expect(await screen.findByRole("button", { name: /Adicionado/ })).toBeInTheDocument();
  });

  it("shows out-of-stock copy on the line rather than a page banner", async () => {
    // Branching on `code`, never on the upstream message — which is English and
    // documented as reword-able.
    server.use(errorRoute(409, ErrorCodes.CART_ITEM_UNAVAILABLE));
    renderButton();

    await clickCta();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não temos essa quantidade em estoque.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sends the visitor to sign in when the session died mid-session", async () => {
    // A 401 is not something to show a message about — there is nothing they can
    // do in place.
    server.use(errorRoute(401, ErrorCodes.TOKEN_MISSING));
    renderButton();

    await clickCta();

    await waitFor(() =>
      expect(navigateTo).toHaveBeenCalledWith(`/api/auth/login?next=${encodeURIComponent(`/books/${BOOK_ID}`)}`),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says something useful when the BFF cannot be reached at all", async () => {
    server.use(http.post(ITEMS_ROUTE, () => HttpResponse.error()));
    renderButton();

    await clickCta();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível conectar/);
  });

  it("falls back to generic copy for a code it has no wording for", async () => {
    server.use(errorRoute(500, "SOMETHING_NEW_UPSTREAM"));
    renderButton();

    await clickCta();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Estamos com um problema. Tente novamente.",
    );
  });

  it("cannot be fired twice while the first request is in flight", async () => {
    let calls = 0;
    // Held until the second click has landed, not for a fixed 50ms: a timer
    // makes this test fail on a slow run for a reason unrelated to the guard.
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post(ITEMS_ROUTE, async () => {
        calls += 1;
        await inFlight;
        return HttpResponse.json(cart);
      }),
    );
    renderButton();

    const cta = screen.getByRole("button", { name: /Adicionar ao carrinho/ });
    await userEvent.click(cta);
    await userEvent.click(cta);
    release();

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(calls).toBe(1);
  });

  it("links to sign-in instead of buying when signed out", () => {
    renderButton({ signedIn: false });

    expect(screen.getByRole("link", { name: /Adicionar ao carrinho/ })).toHaveAttribute(
      "href",
      `/api/auth/login?next=${encodeURIComponent(`/books/${BOOK_ID}`)}`,
    );
  });

  it("offers nothing to click for a book that is out of stock", () => {
    renderButton({ available: false });

    expect(screen.getByRole("button", { name: "Indisponível" })).toBeDisabled();
  });
});
