import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/config";
import { ErrorCodes } from "./error-codes";
import { isApiError } from "./errors";
import { cancelOrder, checkout, getOrder, listOrders, parseOrderSearchParams } from "./orders";
import { server } from "@/test/msw";
import type { OrderSummaryViewModel, OrderViewModel } from "./types";

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
    statusReason: null,
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

  it("hands back the order PENDING: the checkout has only started", async () => {
    // An asynchronous saga since the backend split up — the outcome arrives as
    // the order's status later (docs/specs/21).
    server.use(
      http.post(CHECKOUT_URL, () =>
        HttpResponse.json(order({ status: "PENDING", statusHistory: [] }), { status: 202 }),
      ),
    );

    const result = await checkout(TOKEN, "CREDIT_CARD");

    expect(result.status).toBe("PENDING");
    expect(result.statusHistory).toEqual([]);
  });

  it("surfaces an empty cart as 409 CART_EMPTY", async () => {
    server.use(
      http.post(CHECKOUT_URL, () => problem(409, ErrorCodes.CART_EMPTY, "The cart is empty")),
    );

    const error = await checkout(TOKEN, "PIX").catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.CART_EMPTY);
    expect(isApiError(error) && error.isConflict).toBe(true);
  });

  it("surfaces a checkout already running as 409 CHECKOUT_IN_PROGRESS", async () => {
    server.use(
      http.post(CHECKOUT_URL, () =>
        problem(409, ErrorCodes.CHECKOUT_IN_PROGRESS, "A checkout is already running"),
      ),
    );

    const error = await checkout(TOKEN, "PIX").catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.CHECKOUT_IN_PROGRESS);
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

/** A history row — the listing carries `itemCount`, never the items themselves. */
function summary(overrides: Partial<OrderSummaryViewModel> = {}): OrderSummaryViewModel {
  return {
    id: ORDER_ID,
    status: "CONFIRMED",
    totalAmount: 139.8,
    itemCount: 2,
    createdAt: "2026-08-05T19:39:50.182109Z",
    ...overrides,
  };
}

describe("listOrders", () => {
  it("asks for a page and sends the token", async () => {
    const seen: { query?: string; auth?: string | null } = {};
    server.use(
      http.get(ORDERS_URL, ({ request }) => {
        const url = new URL(request.url);
        seen.query = url.search;
        seen.auth = request.headers.get("Authorization");
        return HttpResponse.json({
          content: [summary()],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        });
      }),
    );

    const result = await listOrders(TOKEN, { page: 0, size: 20 });

    expect(seen.auth).toBe(`Bearer ${TOKEN}`);
    expect(result.content[0].itemCount).toBe(2);
  });

  it("never sends a sort parameter", async () => {
    // The route reads none, by contract rather than oversight: orders are served
    // newest-first everywhere (09-contract-notes.md item 28). Sending one would
    // be cargo cult, and this is the test that keeps it from creeping back.
    const seen: { params?: string[] } = {};
    server.use(
      http.get(ORDERS_URL, ({ request }) => {
        seen.params = [...new URL(request.url).searchParams.keys()];
        return HttpResponse.json({
          content: [],
          page: 0,
          size: 20,
          totalElements: 0,
          totalPages: 0,
        });
      }),
    );

    await listOrders(TOKEN, { page: 2, size: 10 });

    expect(seen.params).toEqual(["page", "size"]);
  });

  it("passes an empty history straight through", async () => {
    server.use(
      http.get(ORDERS_URL, () =>
        HttpResponse.json({
          content: [],
          page: 0,
          size: 20,
          totalElements: 0,
          totalPages: 0,
        }),
      ),
    );

    const result = await listOrders(TOKEN);

    expect(result.content).toEqual([]);
    expect(result.totalPages).toBe(0);
  });

  it("does not reorder what the upstream sent", async () => {
    // The fix lives in the backend (932727f). If anything here ever "helpfully"
    // sorted, it would fight the upstream and put the newest order last again.
    const newest = summary({ id: ORDER_ID, createdAt: "2026-08-05T19:39:50.182109Z" });
    const oldest = summary({
      id: "0aca9835-1f0e-4a51-9f3b-0a5c9f0e4d21",
      createdAt: "2026-08-05T19:39:50.037794Z",
    });
    server.use(
      http.get(ORDERS_URL, () =>
        HttpResponse.json({
          content: [newest, oldest],
          page: 0,
          size: 20,
          totalElements: 2,
          totalPages: 1,
        }),
      ),
    );

    const result = await listOrders(TOKEN);

    expect(result.content.map((o) => o.id)).toEqual([newest.id, oldest.id]);
  });

  it("treats a dead session as a session problem", async () => {
    server.use(
      http.get(ORDERS_URL, () => problem(401, ErrorCodes.TOKEN_MISSING, "Authentication required")),
    );

    const error = await listOrders(TOKEN).catch((e: unknown) => e);

    expect(isApiError(error) && error.isSessionProblem).toBe(true);
  });
});

describe("cancelOrder", () => {
  it("DELETEs and returns the updated order, not an empty body", async () => {
    // Named DELETE, answers 200 with the whole order. Verified live.
    const seen: { method?: string; url?: string } = {};
    server.use(
      http.delete(`${ORDERS_URL}/:orderId`, ({ request }) => {
        seen.method = request.method;
        seen.url = new URL(request.url).pathname;
        return HttpResponse.json(
          order({
            status: "CANCELLED",
            statusHistory: [
              ...order().statusHistory,
              {
                fromStatus: "CONFIRMED",
                toStatus: "CANCELLED",
                changedAt: "2026-08-05T19:39:51.015242Z",
                changedBy: "224d5247-205a-4c88-868b-80672a010493",
              },
            ],
          }),
        );
      }),
    );

    const result = await cancelOrder(TOKEN, ORDER_ID);

    expect(seen.method).toBe("DELETE");
    expect(seen.url).toBe(`/api/v1/orders/${ORDER_ID}`);
    expect(result.status).toBe("CANCELLED");
    expect(result.statusHistory.at(-1)).toMatchObject({
      fromStatus: "CONFIRMED",
      toStatus: "CANCELLED",
    });
  });

  it("surfaces a second cancellation as 409 ORDER_CANCELLATION_NOT_ALLOWED", async () => {
    // The likeliest failure of the flow: what a double click answers.
    server.use(
      http.delete(`${ORDERS_URL}/:orderId`, () =>
        problem(
          409,
          ErrorCodes.ORDER_CANCELLATION_NOT_ALLOWED,
          "Order … cannot be cancelled in status: CANCELLED",
        ),
      ),
    );

    const error = await cancelOrder(TOKEN, ORDER_ID).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.ORDER_CANCELLATION_NOT_ALLOWED);
    expect(isApiError(error) && error.isConflict).toBe(true);
  });

  it("surfaces another customer's order as 403 ORDER_ACCESS_DENIED", async () => {
    server.use(
      http.delete(`${ORDERS_URL}/:orderId`, () =>
        problem(403, ErrorCodes.ORDER_ACCESS_DENIED, "Access denied to order: …"),
      ),
    );

    const error = await cancelOrder(TOKEN, ORDER_ID).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.ORDER_ACCESS_DENIED);
    expect(isApiError(error) && error.isForbidden).toBe(true);
    // A permission failure, not a dead session — it must not trigger a refresh.
    expect(isApiError(error) && error.isSessionProblem).toBe(false);
  });

  it("reports a missing order as ORDER_NOT_FOUND", async () => {
    server.use(
      http.delete(`${ORDERS_URL}/:orderId`, () =>
        problem(404, ErrorCodes.ORDER_NOT_FOUND, "Order not found: …"),
      ),
    );

    const error = await cancelOrder(TOKEN, ORDER_ID).catch((e: unknown) => e);

    expect(isApiError(error) && error.isNotFound).toBe(true);
  });
});

describe("parseOrderSearchParams", () => {
  it("reads a usable page and size", () => {
    expect(parseOrderSearchParams({ page: "2", size: "10" })).toEqual({ page: 2, size: 10 });
  });

  it("falls back to the first page and the default size when nothing is given", () => {
    expect(parseOrderSearchParams()).toEqual({ page: 0, size: DEFAULT_PAGE_SIZE });
  });

  it("drops the junk the upstream would answer 400 to", () => {
    // Measured: `page=-1`, `size=0` and `page=abc` are all 400 upstream. A typo
    // in the address bar has to show the list, not an error page.
    expect(parseOrderSearchParams({ page: "-1" }).page).toBe(0);
    expect(parseOrderSearchParams({ page: "abc" }).page).toBe(0);
    expect(parseOrderSearchParams({ page: "1.5" }).page).toBe(0);
    expect(parseOrderSearchParams({ size: "0" }).size).toBe(DEFAULT_PAGE_SIZE);
    expect(parseOrderSearchParams({ size: "abc" }).size).toBe(DEFAULT_PAGE_SIZE);
    expect(parseOrderSearchParams({ page: "", size: " " })).toEqual({
      page: 0,
      size: DEFAULT_PAGE_SIZE,
    });
  });

  it("caps the size, because the upstream honours ?size=1000 literally", () => {
    expect(parseOrderSearchParams({ size: "1000" }).size).toBe(MAX_PAGE_SIZE);
  });

  it("refuses a repeated parameter outright instead of picking one", () => {
    expect(parseOrderSearchParams({ page: ["1", "2"] })).toEqual({
      page: 0,
      size: DEFAULT_PAGE_SIZE,
    });
  });
});
