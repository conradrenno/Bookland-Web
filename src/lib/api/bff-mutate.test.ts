import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { bffMutate } from "./bff-mutate";
import { ErrorCodes } from "./error-codes";
import { server } from "@/test/msw";

/**
 * The real callers pass a relative route ("/api/cart/items"), which only
 * resolves in a browser. Node has no base URL, so the tests use an absolute one
 * — the helper never inspects the string, it just hands it to `fetch`.
 */
const ROUTE = "http://localhost:3000/api/cart/items";

describe("bffMutate", () => {
  it("returns the payload on success", async () => {
    server.use(http.post(ROUTE, () => HttpResponse.json({ total: 42 })));

    const result = await bffMutate<{ total: number }>(ROUTE, { method: "POST", body: {} });

    expect(result).toEqual({ ok: true, data: { total: 42 } });
  });

  it("sends the JSON content type only when there is a body", async () => {
    // A DELETE with `Content-Type: application/json` and no body makes some
    // proxies unhappy, and says something untrue.
    const seen: string[] = [];
    server.use(
      http.delete(ROUTE, ({ request }) => {
        seen.push(String(request.headers.get("Content-Type")));
        return HttpResponse.json({});
      }),
      http.post(ROUTE, ({ request }) => {
        seen.push(String(request.headers.get("Content-Type")));
        return HttpResponse.json({});
      }),
    );

    await bffMutate(ROUTE, { method: "DELETE" });
    await bffMutate(ROUTE, { method: "POST", body: { a: 1 } });

    expect(seen[0]).toBe("null");
    expect(seen[1]).toContain("application/json");
  });

  it("translates the code into pt-BR copy the caller can render as-is", async () => {
    server.use(
      http.post(ROUTE, () =>
        HttpResponse.json(
          { code: ErrorCodes.CART_ITEM_UNAVAILABLE, message: "ignored — English" },
          { status: 409 },
        ),
      ),
    );

    const result = await bffMutate(ROUTE, { method: "POST", body: {} });

    expect(result).toMatchObject({
      ok: false,
      code: ErrorCodes.CART_ITEM_UNAVAILABLE,
      message: "Não temos essa quantidade em estoque.",
      sessionExpired: false,
    });
  });

  it("flags a 401 as an expired session rather than a message to display", async () => {
    server.use(
      http.post(ROUTE, () =>
        HttpResponse.json({ code: ErrorCodes.TOKEN_MISSING, message: "" }, { status: 401 }),
      ),
    );

    const result = await bffMutate(ROUTE, { method: "POST", body: {} });

    expect(result).toMatchObject({ ok: false, sessionExpired: true });
  });

  it("falls back to generic copy when the error body is not our envelope", async () => {
    // A crash above the handler, or a proxy answering HTML.
    server.use(http.post(ROUTE, () => new HttpResponse("<html>502</html>", { status: 502 })));

    const result = await bffMutate(ROUTE, { method: "POST", body: {} });

    expect(result).toMatchObject({
      ok: false,
      code: ErrorCodes.UNKNOWN,
      message: "Estamos com um problema. Tente novamente.",
    });
  });

  it("treats an unreachable BFF as a network failure", async () => {
    server.use(http.post(ROUTE, () => HttpResponse.error()));

    const result = await bffMutate(ROUTE, { method: "POST", body: {} });

    expect(result).toMatchObject({ ok: false, code: ErrorCodes.NETWORK_ERROR });
  });

  it("refuses a 2xx whose body does not parse", async () => {
    // Our own handler breaking its contract. Handing the caller `null` as if it
    // were a cart would render an empty one over a good one.
    server.use(http.post(ROUTE, () => new HttpResponse("not json", { status: 200 })));

    const result = await bffMutate(ROUTE, { method: "POST", body: {} });

    expect(result).toMatchObject({ ok: false, code: ErrorCodes.INVALID_RESPONSE });
  });
});
