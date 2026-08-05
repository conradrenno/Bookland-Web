import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { server } from "@/test/msw";
import { DELETE } from "./route";

vi.mock("@/lib/auth/server", () => ({ getAccessToken: vi.fn() }));
const { getAccessToken } = await import("@/lib/auth/server");
const mockedToken = vi.mocked(getAccessToken);

const ORDER_ID = "45bb517d-0ac5-4044-8bac-348572d09a03";
const UPSTREAM = `http://localhost:8080/api/v1/orders/${ORDER_ID}`;
const TOKEN = "header.payload.signature";

const cancelledOrder = {
  id: ORDER_ID,
  customerId: "398bb8b1-332b-42c8-acd4-67d08e32d30e",
  items: [
    {
      bookId: "6f3b774a-a045-4e65-9fee-3517b54724a0",
      title: "Cem Anos de Solidão",
      quantity: 1,
      unitPrice: 69.9,
      subtotal: 69.9,
    },
  ],
  status: "CANCELLED",
  totalAmount: 69.9,
  statusHistory: [
    {
      fromStatus: "AWAITING_PAYMENT",
      toStatus: "CONFIRMED",
      changedAt: "2026-08-05T18:17:49.832004Z",
      changedBy: "398bb8b1-332b-42c8-acd4-67d08e32d30e",
    },
    {
      fromStatus: "CONFIRMED",
      toStatus: "CANCELLED",
      changedAt: "2026-08-05T18:17:50.015242Z",
      changedBy: "398bb8b1-332b-42c8-acd4-67d08e32d30e",
    },
  ],
  createdAt: "2026-08-05T18:17:49.830944Z",
  updatedAt: "2026-08-05T18:17:50.015242Z",
};

/** Next hands dynamic segments in as a promise. */
function context(orderId = ORDER_ID) {
  return { params: Promise.resolve({ orderId }) };
}

function del(orderId?: string): Promise<Response> {
  return DELETE(
    new Request(`http://localhost:3000/api/orders/${orderId ?? ORDER_ID}`, { method: "DELETE" }),
    context(orderId),
  );
}

/** Problem body in the shape the upstream really sends. */
function problem(status: number, code: string, detail: string) {
  return HttpResponse.json(
    { status, title: "Conflict", detail, code, instance: `/api/v1/orders/${ORDER_ID}` },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

beforeEach(() => {
  mockedToken.mockResolvedValue(TOKEN);
});

describe("DELETE /api/orders/[orderId]", () => {
  it("forwards the cancellation and hands back the updated order", async () => {
    const seen: { method?: string; auth?: string | null } = {};
    server.use(
      http.delete(UPSTREAM, ({ request }) => {
        seen.method = request.method;
        seen.auth = request.headers.get("Authorization");
        return HttpResponse.json(cancelledOrder);
      }),
    );

    const response = await del();

    expect(response.status).toBe(200);
    expect(seen.method).toBe("DELETE");
    // The token comes from the httpOnly cookie, never from the browser.
    expect(seen.auth).toBe(`Bearer ${TOKEN}`);
    await expect(response.json()).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it("answers 401 with a body when there is no session", async () => {
    // A body, not a redirect: this route is reached by fetch, which would follow
    // a redirect and hand the caller the login page's HTML as a 200.
    mockedToken.mockResolvedValue(null);

    const response = await del();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: ErrorCodes.TOKEN_MISSING });
  });

  it("refuses a malformed id without calling upstream", async () => {
    let called = false;
    server.use(
      http.delete("http://localhost:8080/api/v1/orders/*", () => {
        called = true;
        return HttpResponse.json(cancelledOrder);
      }),
    );

    const response = await del("nao-e-uuid");

    expect(response.status).toBe(400);
    expect(called).toBe(false);
    await expect(response.json()).resolves.toMatchObject({ code: ErrorCodes.INVALID_PARAMETER });
  });

  it("keeps the 409 distinguishable, because a second click lands here", async () => {
    server.use(
      http.delete(UPSTREAM, () =>
        problem(
          409,
          ErrorCodes.ORDER_CANCELLATION_NOT_ALLOWED,
          `Order ${ORDER_ID} cannot be cancelled in status: CANCELLED`,
        ),
      ),
    );

    const response = await del();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: ErrorCodes.ORDER_CANCELLATION_NOT_ALLOWED,
    });
  });

  it("passes a 403 on someone else's order through as a 403", async () => {
    // Not laundered into a 404 here: the route handler's job is to keep the code
    // intact. Turning it into "not found" is the *page's* choice, made once.
    server.use(
      http.delete(UPSTREAM, () =>
        problem(403, ErrorCodes.ORDER_ACCESS_DENIED, `Access denied to order: ${ORDER_ID}`),
      ),
    );

    const response = await del();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: ErrorCodes.ORDER_ACCESS_DENIED,
    });
  });

  it("passes a missing order through as a 404", async () => {
    server.use(
      http.delete(UPSTREAM, () =>
        problem(404, ErrorCodes.ORDER_NOT_FOUND, `Order not found: ${ORDER_ID}`),
      ),
    );

    const response = await del();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: ErrorCodes.ORDER_NOT_FOUND });
  });
});
