import { delay, http, HttpResponse, type StrictRequest, type DefaultBodyType } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/msw";
import { apiFetch } from "./client";
import { ErrorCodes } from "./error-codes";
import { isApiError } from "./errors";

const BASE = "http://localhost:8080";

/**
 * Stubs an endpoint and captures the request MSW saw, so a test can assert on
 * what we actually put on the wire (headers, body, query).
 */
function captureRequest(
  method: "get" | "post",
  path: string,
  respond: () => Response | Promise<Response>,
) {
  const seen: { request?: StrictRequest<DefaultBodyType> } = {};
  server.use(
    http[method](`${BASE}${path}`, ({ request }) => {
      seen.request = request.clone();
      return respond();
    }),
  );
  return seen;
}

describe("apiFetch", () => {
  it("returns the decoded body on 200", async () => {
    server.use(
      http.get(`${BASE}/api/v1/books/1`, () =>
        HttpResponse.json({ id: "1", title: "Clean Code" }),
      ),
    );

    await expect(apiFetch("/api/v1/books/1")).resolves.toEqual({
      id: "1",
      title: "Clean Code",
    });
  });

  it("sends query params, dropping nullish and keeping page=0", async () => {
    const seen = captureRequest("get", "/api/v1/books", () => HttpResponse.json({}));

    await apiFetch("/api/v1/books", {
      query: { q: "clean", page: 0, category: undefined, minPrice: null },
    });

    const url = new URL(seen.request!.url);
    expect(url.searchParams.get("q")).toBe("clean");
    expect(url.searchParams.get("page")).toBe("0");
    expect(url.searchParams.has("category")).toBe(false);
    expect(url.searchParams.has("minPrice")).toBe(false);
  });

  it("defaults to GET and sends no body or Content-Type", async () => {
    const seen = captureRequest("get", "/api/v1/books", () => HttpResponse.json({}));

    await apiFetch("/api/v1/books");

    expect(seen.request!.method).toBe("GET");
    expect(seen.request!.headers.get("Content-Type")).toBeNull();
  });

  it("serialises the body and sets Content-Type on writes", async () => {
    const seen = captureRequest("post", "/api/v1/auth/login", () =>
      HttpResponse.json({ accessToken: "t" }, { status: 200 }),
    );

    await apiFetch("/api/v1/auth/login", {
      method: "POST",
      body: { email: "a@b.com", password: "senha1234" },
    });

    expect(seen.request!.headers.get("Content-Type")).toBe("application/json");
    await expect(seen.request!.json()).resolves.toEqual({
      email: "a@b.com",
      password: "senha1234",
    });
  });

  it("attaches the bearer token only when one is supplied", async () => {
    const withToken = captureRequest("get", "/api/v1/cart", () => HttpResponse.json({}));
    await apiFetch("/api/v1/cart", { accessToken: "tok-123" });
    expect(withToken.request!.headers.get("Authorization")).toBe("Bearer tok-123");

    const anonymous = captureRequest("get", "/api/v1/books", () => HttpResponse.json({}));
    await apiFetch("/api/v1/books");
    expect(anonymous.request!.headers.get("Authorization")).toBeNull();

    // A null token is "signed out", not "send an empty header".
    const signedOut = captureRequest("get", "/api/v1/books", () => HttpResponse.json({}));
    await apiFetch("/api/v1/books", { accessToken: null });
    expect(signedOut.request!.headers.get("Authorization")).toBeNull();
  });

  it("accepts both JSON and problem+json", async () => {
    const seen = captureRequest("get", "/api/v1/books", () => HttpResponse.json({}));

    await apiFetch("/api/v1/books");

    expect(seen.request!.headers.get("Accept")).toContain("application/problem+json");
  });
});

describe("bodyless responses", () => {
  // Logout, deletes and the refund endpoint all answer 204; calling .json()
  // there would throw.
  it("resolves to undefined on 204 without trying to parse", async () => {
    server.use(http.post(`${BASE}/api/v1/auth/logout`, () => new HttpResponse(null, { status: 204 })));

    await expect(apiFetch("/api/v1/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("resolves to undefined when a 200 carries an empty body", async () => {
    server.use(http.get(`${BASE}/api/v1/books`, () => new HttpResponse("", { status: 200 })));

    await expect(apiFetch("/api/v1/books")).resolves.toBeUndefined();
  });

  it("raises INVALID_RESPONSE when a 2xx body is not valid JSON", async () => {
    server.use(http.get(`${BASE}/api/v1/books`, () => HttpResponse.html("<html>nope</html>")));

    await expect(apiFetch("/api/v1/books")).rejects.toMatchObject({
      code: ErrorCodes.INVALID_RESPONSE,
    });
  });
});

describe("failure handling", () => {
  it("throws ApiError carrying the upstream code on a 4xx", async () => {
    server.use(
      http.post(`${BASE}/api/v1/books/1/reviews`, () =>
        HttpResponse.json(
          { title: "Conflict", status: 409, code: "DUPLICATE_REVIEW" },
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    await expect(
      apiFetch("/api/v1/books/1/reviews", { method: "POST" }),
    ).rejects.toMatchObject({ status: 409, code: ErrorCodes.DUPLICATE_REVIEW });
  });

  it("wraps an unreachable upstream as NETWORK_ERROR", async () => {
    server.use(http.get(`${BASE}/api/v1/books`, () => HttpResponse.error()));

    const error = await apiFetch("/api/v1/books").catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.NETWORK_ERROR);
    expect(isApiError(error) && error.isTransport).toBe(true);
  });

  it("reports TIMEOUT when the internal budget elapses", async () => {
    server.use(
      http.get(`${BASE}/api/v1/books`, async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
    );

    await expect(apiFetch("/api/v1/books", { timeoutMs: 10 })).rejects.toMatchObject({
      code: ErrorCodes.TIMEOUT,
    });
  });

  it("lets a caller-initiated abort propagate untouched", async () => {
    // React discards superseded renders this way; it must not look like an
    // upstream failure or the UI would show an error banner for it.
    server.use(
      http.get(`${BASE}/api/v1/books`, async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
    );

    const controller = new AbortController();
    const pending = apiFetch("/api/v1/books", { signal: controller.signal });
    controller.abort();

    const error = await pending.catch((e: unknown) => e);
    expect(isApiError(error)).toBe(false);
    expect((error as Error).name).toBe("AbortError");
  });

  it("clears the timeout timer once a call settles", async () => {
    // A dangling timer would keep the Node process alive after a fast response.
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    server.use(http.get(`${BASE}/api/v1/books`, () => HttpResponse.json({})));

    await apiFetch("/api/v1/books");

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
