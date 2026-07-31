import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { server } from "@/test/msw";
import { POST } from "./route";

// The only piece of Next's request scope these handlers touch. Mocking it keeps
// the test to what the handler decides, without standing up a cookie store.
vi.mock("@/lib/auth/server", () => ({ getAccessToken: vi.fn() }));
const { getAccessToken } = await import("@/lib/auth/server");
const mockedToken = vi.mocked(getAccessToken);

const UPSTREAM = "http://localhost:8080/api/v1/cart/items";
const BOOK_ID = "07182eaa-39c4-4f61-9d0f-c34de7594a1e";
const TOKEN = "header.payload.signature";

const emptyCart = {
  id: "13bab7e3-f756-4f63-9a64-edffb25ad6a2",
  customerId: "eee6a6d1-b523-473d-b0e6-992ad0e30fa7",
  items: [],
  total: 0,
  updatedAt: "2026-07-30T19:55:56.993067Z",
};

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost:3000/api/cart/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mockedToken.mockResolvedValue(TOKEN);
});

describe("POST /api/cart/items", () => {
  it("forwards the item and answers with the updated cart", async () => {
    const seen: { body?: unknown; auth?: string | null } = {};
    server.use(
      http.post(UPSTREAM, async ({ request }) => {
        seen.body = await request.json();
        seen.auth = request.headers.get("Authorization");
        return HttpResponse.json(emptyCart);
      }),
    );

    const response = await post({ bookId: BOOK_ID, quantity: 2 });

    expect(response.status).toBe(200);
    expect(seen.body).toEqual({ bookId: BOOK_ID, quantity: 2 });
    expect(seen.auth).toBe(`Bearer ${TOKEN}`);
    expect(await response.json()).toEqual(emptyCart);
  });

  it("fills in a quantity of 1 when the caller omits it", async () => {
    // The upstream has no default — an absent quantity is a 400 there.
    const seen: { body?: unknown } = {};
    server.use(
      http.post(UPSTREAM, async ({ request }) => {
        seen.body = await request.json();
        return HttpResponse.json(emptyCart);
      }),
    );

    await post({ bookId: BOOK_ID });

    expect(seen.body).toEqual({ bookId: BOOK_ID, quantity: 1 });
  });

  it("answers 401 instead of redirecting when there is no session", async () => {
    // A redirect would be followed by `fetch` and hand the caller the login
    // page's HTML with a 200.
    mockedToken.mockResolvedValue(null);

    const response = await post({ bookId: BOOK_ID });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.TOKEN_MISSING });
  });

  it.each([
    ["a missing bookId", {}],
    ["a bookId that is not a UUID", { bookId: "lixo" }],
  ])("rejects %s without calling upstream", async (_label, body) => {
    // No MSW handler registered: the suite errors on any unhandled request, so
    // this also proves the upstream was never contacted.
    const response = await post(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.INVALID_PARAMETER });
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 2.5],
    ["not a number", "2"],
  ])("rejects a %s quantity without calling upstream", async (_label, quantity) => {
    const response = await post({ bookId: BOOK_ID, quantity });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.VALIDATION_ERROR });
  });

  it("rejects a body that is not JSON at all", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/cart/items", { method: "POST", body: "not json" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.MALFORMED_REQUEST });
  });

  it("passes an out-of-stock conflict through with its status and code", async () => {
    // The whole point of forwarding rather than collapsing: the button needs to
    // tell "no stock" apart from "book gone".
    server.use(
      http.post(UPSTREAM, () =>
        HttpResponse.json(
          {
            status: 409,
            title: "Conflict",
            detail: "Insufficient stock",
            code: ErrorCodes.CART_ITEM_UNAVAILABLE,
          },
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const response = await post({ bookId: BOOK_ID, quantity: 99 });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: ErrorCodes.CART_ITEM_UNAVAILABLE });
  });
});
