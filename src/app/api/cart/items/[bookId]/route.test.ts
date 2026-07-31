import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { server } from "@/test/msw";
import { DELETE, PATCH } from "./route";

vi.mock("@/lib/auth/server", () => ({ getAccessToken: vi.fn() }));
const { getAccessToken } = await import("@/lib/auth/server");
const mockedToken = vi.mocked(getAccessToken);

const BOOK_ID = "07182eaa-39c4-4f61-9d0f-c34de7594a1e";
const UPSTREAM = `http://localhost:8080/api/v1/cart/items/${BOOK_ID}`;
const TOKEN = "header.payload.signature";

const emptyCart = {
  id: "13bab7e3-f756-4f63-9a64-edffb25ad6a2",
  customerId: "eee6a6d1-b523-473d-b0e6-992ad0e30fa7",
  items: [],
  total: 0,
  updatedAt: "2026-07-30T19:55:56.993067Z",
};

/** Next hands dynamic segments in as a promise. */
function context(bookId = BOOK_ID) {
  return { params: Promise.resolve({ bookId }) };
}

function patch(body: unknown, bookId?: string): Promise<Response> {
  return PATCH(
    new Request(`http://localhost:3000/api/cart/items/${bookId ?? BOOK_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    context(bookId),
  );
}

beforeEach(() => {
  mockedToken.mockResolvedValue(TOKEN);
});

describe("PATCH /api/cart/items/[bookId]", () => {
  it("forwards the exact quantity to the book's upstream URL", async () => {
    const seen: { body?: unknown } = {};
    server.use(
      http.patch(UPSTREAM, async ({ request }) => {
        seen.body = await request.json();
        return HttpResponse.json(emptyCart);
      }),
    );

    const response = await patch({ quantity: 3 });

    expect(response.status).toBe(200);
    expect(seen.body).toEqual({ quantity: 3 });
  });

  it("lets 0 through, because upstream reads it as a removal", async () => {
    // The floor here is 0, not 1 — this is how the stepper deletes a line.
    const seen: { body?: unknown } = {};
    server.use(
      http.patch(UPSTREAM, async ({ request }) => {
        seen.body = await request.json();
        return HttpResponse.json(emptyCart);
      }),
    );

    const response = await patch({ quantity: 0 });

    expect(response.status).toBe(200);
    expect(seen.body).toEqual({ quantity: 0 });
  });

  it.each([
    ["negative", -1],
    ["fractional", 1.5],
    ["absent", undefined],
  ])("rejects a %s quantity without calling upstream", async (_label, quantity) => {
    const response = await patch({ quantity });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.VALIDATION_ERROR });
  });

  it("rejects a bookId that is not a UUID", async () => {
    const response = await patch({ quantity: 1 }, "lixo");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.INVALID_PARAMETER });
  });

  it("answers 401 when there is no session", async () => {
    mockedToken.mockResolvedValue(null);

    const response = await patch({ quantity: 1 });

    expect(response.status).toBe(401);
  });

  it("forwards BOOK_NOT_IN_CART so the row can say the line is gone", async () => {
    server.use(
      http.patch(UPSTREAM, () =>
        HttpResponse.json(
          {
            status: 404,
            title: "Not Found",
            detail: `Book not in cart: ${BOOK_ID}`,
            code: ErrorCodes.BOOK_NOT_IN_CART,
          },
          { status: 404, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const response = await patch({ quantity: 2 });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.BOOK_NOT_IN_CART });
  });
});

describe("DELETE /api/cart/items/[bookId]", () => {
  it("removes the line and answers with the updated cart", async () => {
    const seen: { method?: string } = {};
    server.use(
      http.delete(UPSTREAM, ({ request }) => {
        seen.method = request.method;
        return HttpResponse.json(emptyCart);
      }),
    );

    const response = await DELETE(
      new Request(`http://localhost:3000/api/cart/items/${BOOK_ID}`, { method: "DELETE" }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(seen.method).toBe("DELETE");
    expect(await response.json()).toEqual(emptyCart);
  });

  it("rejects a bookId that is not a UUID", async () => {
    const response = await DELETE(
      new Request("http://localhost:3000/api/cart/items/lixo", { method: "DELETE" }),
      context("lixo"),
    );

    expect(response.status).toBe(400);
  });

  it("answers 401 when there is no session", async () => {
    mockedToken.mockResolvedValue(null);

    const response = await DELETE(
      new Request(`http://localhost:3000/api/cart/items/${BOOK_ID}`, { method: "DELETE" }),
      context(),
    );

    expect(response.status).toBe(401);
  });
});
