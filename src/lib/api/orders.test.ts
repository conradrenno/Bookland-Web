import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { ErrorCodes } from "./error-codes";
import { isApiError } from "./errors";
import { checkout, getOrder } from "./orders";
import { server } from "@/test/msw";
import type { OrderViewModel } from "./types";

const BASE = "http://localhost:8080";
const CHECKOUT_URL = `${BASE}/api/v1/cart/checkout`;
const ORDERS_URL = `${BASE}/api/v1/orders`;
const TOKEN = "header.payload.signature";
const ORDER_ID = "f8bbf26e-28bb-46e0-a0a2-4aba8e674026";
const BOOK_ID = "c2264c4b-682a-47ee-b8d7-aa08f202625a";

/** Shaped like a real response: confirmed, paid, with the transition already recorded. */
function order(overrides: Partial<OrderViewModel> = {}): OrderViewModel {
  return {
    id: ORDER_ID,
    customerId: "224d5247-205a-4c88-868b-80672a010493",
    items: [
      {
        bookId: BOOK_ID,
        title: "Cem Anos de Solidão",
        coverImageUrl: "/covers/cem-anos.jpg",
        quantity: 2,
        unitPrice: 69.9,
        subtotal: 139.8,
      },
    ],
    status: "CONFIRMED",
    totalAmount: 139.8,
    statusHistory: [
      {
        fromStatus: "AWAITING_PAYMENT",
        toStatus: "CONFIRMED",
        changedAt: "2026-07-30T19:55:57.120226Z",
        changedBy: "224d5247-205a-4c88-868b-80672a010493",
      },
    ],
    createdAt: "2026-07-30T19:55:57.117193400Z",
    updatedAt: "2026-07-30T19:55:57.120226Z",
    ...overrides,
  };
}

/** Problem body in the shape the upstream really sends. */
function problem(status: number, code: string, detail: string) {
  return HttpResponse.json(
    { status, title: "Conflict", detail, code, instance: "/api/v1/cart/checkout" },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

describe("checkout", () => {
  it("sends the payment method and nothing else", async () => {
    // The decorative card fields on the page must never reach this call: the API
    // has nowhere to put them (docs/specs/19-checkout.md).
    const seen: { body?: unknown; auth?: string | null } = {};
    server.use(
      http.post(CHECKOUT_URL, async ({ request }) => {
        seen.auth = request.headers.get("Authorization");
        seen.body = await request.json();
        return HttpResponse.json(order());
      }),
    );

    const result = await checkout(TOKEN, "PIX");

    expect(seen.auth).toBe(`Bearer ${TOKEN}`);
    expect(seen.body).toEqual({ paymentMethod: "PIX" });
    expect(result.id).toBe(ORDER_ID);
  });

  it("returns an order that is already confirmed and paid", async () => {
    // Not AWAITING_PAYMENT, whatever the story says: this backend charges inside
    // the checkout call (09-contract-notes.md item 27).
    server.use(http.post(CHECKOUT_URL, () => HttpResponse.json(order())));

    const result = await checkout(TOKEN, "CREDIT_CARD");

    expect(result.status).toBe("CONFIRMED");
    expect(result.statusHistory[0]).toMatchObject({
      fromStatus: "AWAITING_PAYMENT",
      toStatus: "CONFIRMED",
    });
  });

  it("surfaces an empty cart as 404 CART_NOT_FOUND, not a conflict", async () => {
    server.use(
      http.post(CHECKOUT_URL, () =>
        problem(404, ErrorCodes.CART_NOT_FOUND, "Cart not found for customer: …"),
      ),
    );

    const error = await checkout(TOKEN, "PIX").catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.CART_NOT_FOUND);
    expect(isApiError(error) && error.isNotFound).toBe(true);
  });

  it("surfaces the stock re-validation as a 409 the caller can branch on", async () => {
    // The book ids live only inside `detail`, in English — which is why nothing
    // here tries to extract them.
    server.use(
      http.post(CHECKOUT_URL, () =>
        problem(
          409,
          ErrorCodes.CART_ITEM_UNAVAILABLE,
          `Insufficient stock for books: [${BOOK_ID}]`,
        ),
      ),
    );

    const error = await checkout(TOKEN, "PIX").catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.CART_ITEM_UNAVAILABLE);
    expect(isApiError(error) && error.isConflict).toBe(true);
  });

  it("treats a dead session as a session problem, not a business failure", async () => {
    server.use(
      http.post(CHECKOUT_URL, () =>
        problem(401, ErrorCodes.TOKEN_EXPIRED, "Access token expired"),
      ),
    );

    const error = await checkout(TOKEN, "PIX").catch((e: unknown) => e);

    expect(isApiError(error) && error.isSessionProblem).toBe(true);
  });
});

describe("getOrder", () => {
  it("fetches one order with its frozen prices and history", async () => {
    const seen: { url?: string } = {};
    server.use(
      http.get(`${ORDERS_URL}/:orderId`, ({ request }) => {
        seen.url = new URL(request.url).pathname;
        return HttpResponse.json(order());
      }),
    );

    const result = await getOrder(TOKEN, ORDER_ID);

    expect(seen.url).toBe(`/api/v1/orders/${ORDER_ID}`);
    // The snapshot, not today's catalogue price.
    expect(result.items[0].unitPrice).toBe(69.9);
    expect(result.totalAmount).toBe(139.8);
  });

  it("reports a missing order as ORDER_NOT_FOUND", async () => {
    server.use(
      http.get(`${ORDERS_URL}/:orderId`, () =>
        problem(404, ErrorCodes.ORDER_NOT_FOUND, "Order not found: …"),
      ),
    );

    const error = await getOrder(TOKEN, ORDER_ID).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.ORDER_NOT_FOUND);
    expect(isApiError(error) && error.isNotFound).toBe(true);
  });

  it("escapes the id rather than pasting it into the path", async () => {
    // A malformed id must not be able to reshape the URL.
    const seen: { url?: string } = {};
    server.use(
      http.get(`${ORDERS_URL}/:orderId`, ({ request }) => {
        seen.url = new URL(request.url).pathname;
        return HttpResponse.json(order());
      }),
    );

    await getOrder(TOKEN, "../../admin/orders" as never).catch(() => null);

    expect(seen.url).toBe("/api/v1/orders/..%2F..%2Fadmin%2Forders");
  });
});
