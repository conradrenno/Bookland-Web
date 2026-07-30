import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/msw";
import { addCartItem, cartItemCount, getCart, removeCartItem, updateCartItem } from "./cart";
import { ErrorCodes } from "./error-codes";
import { isApiError } from "./errors";
import type { CartViewModel } from "./types";

const BASE = "http://localhost:8080";
const CART_URL = `${BASE}/api/v1/cart`;
const ITEMS_URL = `${CART_URL}/items`;
const TOKEN = "header.payload.signature";
const BOOK_ID = "07182eaa-39c4-4f61-9d0f-c34de7594a1e";

function cart(items: CartViewModel["items"] = []): CartViewModel {
  return {
    id: "13bab7e3-f756-4f63-9a64-edffb25ad6a2",
    customerId: "eee6a6d1-b523-473d-b0e6-992ad0e30fa7",
    items,
    total: items.reduce((sum, item) => sum + item.subtotal, 0),
    // No timezone suffix: that is what the API actually sends.
    updatedAt: "2026-07-29T22:09:28.0627129",
  };
}

function line(quantity: number): CartViewModel["items"][number] {
  return {
    bookId: BOOK_ID,
    title: "Cem Anos de Solidão",
    coverImageUrl: "/covers/cem-anos.jpg",
    quantity,
    unitPrice: 69.9,
    subtotal: 69.9 * quantity,
    available: true,
  };
}

/** Problem body in the shape the upstream really sends. */
function problem(status: number, code: string, detail: string) {
  return HttpResponse.json(
    { status, title: "Conflict", detail, code, instance: "/api/v1/cart/items" },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

describe("getCart", () => {
  it("sends the bearer token and returns the cart", async () => {
    const seen: { auth?: string | null } = {};
    server.use(
      http.get(CART_URL, ({ request }) => {
        seen.auth = request.headers.get("Authorization");
        return HttpResponse.json(cart([line(2)]));
      }),
    );

    const result = await getCart(TOKEN);

    expect(seen.auth).toBe(`Bearer ${TOKEN}`);
    expect(result.items[0].quantity).toBe(2);
  });

  it("surfaces a missing session as a refresh-worthy 401", async () => {
    server.use(
      http.get(CART_URL, () =>
        HttpResponse.json(
          {
            status: 401,
            title: "Unauthorized",
            detail: "Authentication required",
            code: ErrorCodes.TOKEN_MISSING,
            instance: "/api/v1/cart",
          },
          { status: 401, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const error = await getCart(TOKEN).catch((caught: unknown) => caught);

    expect(isApiError(error) && error.isSessionProblem).toBe(true);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.TOKEN_MISSING);
  });
});

describe("addCartItem", () => {
  it("always sends a quantity, defaulting to 1", async () => {
    // Not cosmetic: upstream binds `quantity` to a primitive int, so an omitted
    // one is a 400, not a default of 1 (09-contract-notes.md item 26).
    const seen: { body?: unknown } = {};
    server.use(
      http.post(ITEMS_URL, async ({ request }) => {
        seen.body = await request.json();
        return HttpResponse.json(cart([line(1)]));
      }),
    );

    await addCartItem(TOKEN, BOOK_ID);

    expect(seen.body).toEqual({ bookId: BOOK_ID, quantity: 1 });
  });

  it("forwards an explicit quantity untouched", async () => {
    // The upstream *adds* to what is there, so we must not pre-sum the current
    // quantity — sending 3 onto an existing 2 is what leaves 5.
    const seen: { body?: unknown } = {};
    server.use(
      http.post(ITEMS_URL, async ({ request }) => {
        seen.body = await request.json();
        return HttpResponse.json(cart([line(5)]));
      }),
    );

    const result = await addCartItem(TOKEN, BOOK_ID, 3);

    expect(seen.body).toEqual({ bookId: BOOK_ID, quantity: 3 });
    expect(result.items[0].quantity).toBe(5);
  });

  it("raises a conflict when the request exceeds stock", async () => {
    server.use(
      http.post(ITEMS_URL, () =>
        problem(409, ErrorCodes.CART_ITEM_UNAVAILABLE, `Insufficient stock for book ${BOOK_ID}`),
      ),
    );

    const error = await addCartItem(TOKEN, BOOK_ID, 100).catch((caught: unknown) => caught);

    expect(isApiError(error) && error.isConflict).toBe(true);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.CART_ITEM_UNAVAILABLE);
  });

  it("raises a 404 for a book that is not in the catalogue", async () => {
    server.use(
      http.post(ITEMS_URL, () => problem(404, ErrorCodes.BOOK_NOT_FOUND, "Book not found")),
    );

    const error = await addCartItem(TOKEN, BOOK_ID).catch((caught: unknown) => caught);

    expect(isApiError(error) && error.isNotFound).toBe(true);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.BOOK_NOT_FOUND);
  });
});

describe("updateCartItem", () => {
  it("PATCHes the exact quantity to the book's own URL", async () => {
    const seen: { body?: unknown; url?: string } = {};
    server.use(
      http.patch(`${ITEMS_URL}/:bookId`, async ({ request }) => {
        seen.body = await request.json();
        seen.url = request.url;
        return HttpResponse.json(cart([line(4)]));
      }),
    );

    await updateCartItem(TOKEN, BOOK_ID, 4);

    expect(seen.body).toEqual({ quantity: 4 });
    expect(seen.url).toBe(`${ITEMS_URL}/${BOOK_ID}`);
  });

  it("treats 0 as the removal the contract says it is", async () => {
    const seen: { body?: unknown } = {};
    server.use(
      http.patch(`${ITEMS_URL}/:bookId`, async ({ request }) => {
        seen.body = await request.json();
        return HttpResponse.json(cart([]));
      }),
    );

    const result = await updateCartItem(TOKEN, BOOK_ID, 0);

    expect(seen.body).toEqual({ quantity: 0 });
    expect(result.items).toEqual([]);
  });

  it("raises BOOK_NOT_IN_CART when the line is already gone", async () => {
    server.use(
      http.patch(`${ITEMS_URL}/:bookId`, () =>
        problem(404, ErrorCodes.BOOK_NOT_IN_CART, `Book not in cart: ${BOOK_ID}`),
      ),
    );

    const error = await updateCartItem(TOKEN, BOOK_ID, 2).catch((caught: unknown) => caught);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.BOOK_NOT_IN_CART);
  });
});

describe("removeCartItem", () => {
  it("DELETEs without a body and returns the updated cart", async () => {
    const seen: { method?: string; contentType?: string | null } = {};
    server.use(
      http.delete(`${ITEMS_URL}/:bookId`, ({ request }) => {
        seen.method = request.method;
        seen.contentType = request.headers.get("Content-Type");
        return HttpResponse.json(cart([]));
      }),
    );

    const result = await removeCartItem(TOKEN, BOOK_ID);

    expect(seen.method).toBe("DELETE");
    // No body means no Content-Type — the header is only set when one is sent.
    expect(seen.contentType).toBeNull();
    expect(result.items).toEqual([]);
  });
});

describe("cartItemCount", () => {
  it("sums quantities rather than counting lines", async () => {
    expect(cartItemCount(cart([line(3)]))).toBe(3);
  });

  it("is 0 for an empty cart and for no cart at all", async () => {
    expect(cartItemCount(cart([]))).toBe(0);
    // The header calls this before knowing whether anyone is signed in.
    expect(cartItemCount(null)).toBe(0);
    expect(cartItemCount(undefined)).toBe(0);
  });
});
