import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { server } from "@/test/msw";
import { POST } from "./route";

// The only piece of Next's request scope this handler touches.
vi.mock("@/lib/auth/server", () => ({ getAccessToken: vi.fn() }));
const { getAccessToken } = await import("@/lib/auth/server");
const mockedToken = vi.mocked(getAccessToken);

const UPSTREAM = "http://localhost:8080/api/v1/cart/checkout";
const TOKEN = "header.payload.signature";
const ORDER_ID = "f8bbf26e-28bb-46e0-a0a2-4aba8e674026";

const order = {
  id: ORDER_ID,
  customerId: "224d5247-205a-4c88-868b-80672a010493",
  items: [],
  status: "PENDING",
  statusReason: null,
  totalAmount: 139.8,
  statusHistory: [],
  createdAt: "2026-07-30T19:55:57.117193400Z",
  updatedAt: "2026-07-30T19:55:57.120226Z",
};

function post(body: unknown, raw?: string): Promise<Response> {
  return POST(
    new Request("http://localhost:3000/api/cart/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ?? JSON.stringify(body),
    }),
  );
}

/** Problem body in the shape the upstream really sends. */
function problem(status: number, code: string, detail: string) {
  return HttpResponse.json(
    { status, title: "Error", detail, code, instance: "/api/v1/cart/checkout" },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

beforeEach(() => {
  mockedToken.mockResolvedValue(TOKEN);
});

describe("POST /api/cart/checkout", () => {
  it("forwards the method with the session token and passes the 202 through", async () => {
    const seen: { body?: unknown; auth?: string | null } = {};
    server.use(
      http.post(UPSTREAM, async ({ request }) => {
        seen.body = await request.json();
        seen.auth = request.headers.get("Authorization");
        return HttpResponse.json(order, { status: 202 });
      }),
    );

    const response = await post({ paymentMethod: "PIX" });

    // Started, not finished: the order is PENDING (docs/specs/21).
    expect(response.status).toBe(202);
    expect(seen.body).toEqual({ paymentMethod: "PIX" });
    expect(seen.auth).toBe(`Bearer ${TOKEN}`);
    expect(await response.json()).toEqual(order);
  });

  it("drops anything the page sends beyond the payment method", async () => {
    // The card fields are decorative. Even if a caller posted them, they must
    // not reach the API — this handler is the last place to stop them.
    const seen: { body?: unknown } = {};
    server.use(
      http.post(UPSTREAM, async ({ request }) => {
        seen.body = await request.json();
        return HttpResponse.json(order);
      }),
    );

    await post({ paymentMethod: "CREDIT_CARD", cardNumber: "4111111111111111", cvv: "123" });

    expect(seen.body).toEqual({ paymentMethod: "CREDIT_CARD" });
  });

  it("refuses a method outside the enum without calling upstream", async () => {
    // Upstream answers a bare MALFORMED_REQUEST for this, naming no field.
    let called = false;
    server.use(
      http.post(UPSTREAM, () => {
        called = true;
        return HttpResponse.json(order);
      }),
    );

    const response = await post({ paymentMethod: "BITCOIN" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.VALIDATION_ERROR });
    expect(called).toBe(false);
  });

  it("refuses a missing method", async () => {
    const response = await post({});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.VALIDATION_ERROR });
  });

  it("answers 400 for a body that is not JSON", async () => {
    const response = await post(undefined, "{ nope");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.MALFORMED_REQUEST });
  });

  it("answers 401 rather than redirecting when there is no session", async () => {
    // A redirect would be followed transparently by `fetch`, handing the form a
    // 200 carrying the login page's HTML.
    mockedToken.mockResolvedValue(null);

    const response = await post({ paymentMethod: "PIX" });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.TOKEN_MISSING });
  });

  it("passes the empty-cart 409 through with its code intact", async () => {
    server.use(http.post(UPSTREAM, () => problem(409, ErrorCodes.CART_EMPTY, "The cart is empty")));

    const response = await post({ paymentMethod: "PIX" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.CART_EMPTY });
  });

  it("passes the stock conflict through, since the form branches on it", async () => {
    server.use(
      http.post(UPSTREAM, () =>
        problem(409, ErrorCodes.CART_ITEM_UNAVAILABLE, "Insufficient stock for books: […]"),
      ),
    );

    const response = await post({ paymentMethod: "PIX" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.CART_ITEM_UNAVAILABLE });
  });
});
