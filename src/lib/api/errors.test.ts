import { describe, expect, it } from "vitest";

import { ErrorCodes } from "./error-codes";
import { ApiError, isApiError, parseUpstreamError } from "./errors";
import type { ProblemDetail } from "./problem";

/** Builds an error `Response` carrying a problem+json body, like the real API. */
function problemResponse(status: number, body: unknown, statusText = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/problem+json" },
  });
}

describe("parseUpstreamError", () => {
  it("maps a problem+json body onto ApiError, preferring detail as the message", async () => {
    const error = await parseUpstreamError(
      problemResponse(404, {
        title: "Not Found",
        status: 404,
        code: "BOOK_NOT_FOUND",
        detail: "Book not found: abc",
        instance: "/api/v1/books/abc",
      } satisfies ProblemDetail),
    );

    expect(error.status).toBe(404);
    expect(error.code).toBe(ErrorCodes.BOOK_NOT_FOUND);
    expect(error.message).toBe("Book not found: abc");
    expect(error.isNotFound).toBe(true);
  });

  it("falls back to title when the body carries no detail", async () => {
    const error = await parseUpstreamError(
      problemResponse(403, { title: "Forbidden", status: 403, code: "INSUFFICIENT_ROLE" }),
    );

    expect(error.message).toBe("Forbidden");
    expect(error.isForbidden).toBe(true);
  });

  it("keeps per-field errors as arrays so a field can report several breaches", async () => {
    const error = await parseUpstreamError(
      problemResponse(400, {
        title: "Bad Request",
        status: 400,
        code: "VALIDATION_ERROR",
        detail: "Validation failed for 2 fields: name, password",
        errors: {
          name: ["must not be blank"],
          password: ["must contain at least one number", "size must be between 8 and 72"],
        },
      }),
    );

    expect(error.messagesFor("password")).toHaveLength(2);
    expect(error.messagesFor("name")).toEqual(["must not be blank"]);
    expect(error.messagesFor("email")).toBeUndefined();
    expect(error.isFieldScoped).toBe(true);
  });

  it("exposes payload-level errors stored under the '_' key", async () => {
    const error = await parseUpstreamError(
      problemResponse(400, {
        title: "Bad Request",
        status: 400,
        code: "VALIDATION_ERROR",
        errors: { _: ["at least one item is required"] },
      }),
    );

    expect(error.payloadLevelMessages).toEqual(["at least one item is required"]);
  });

  it("ignores a malformed errors map instead of trusting it", async () => {
    const error = await parseUpstreamError(
      problemResponse(400, {
        title: "Bad Request",
        status: 400,
        code: "VALIDATION_ERROR",
        errors: { name: "must not be blank" }, // string, not string[]
      }),
    );

    expect(error.fieldErrors).toBeUndefined();
  });

  it("degrades to UNKNOWN when the body is not JSON at all", async () => {
    const response = new Response("<html>502 Bad Gateway</html>", {
      status: 502,
      statusText: "Bad Gateway",
    });

    const error = await parseUpstreamError(response);

    expect(error.code).toBe(ErrorCodes.UNKNOWN);
    expect(error.message).toBe("Bad Gateway");
    expect(error.isServerFault).toBe(true);
  });

  it("degrades to UNKNOWN when JSON parses but is not a problem envelope", async () => {
    const error = await parseUpstreamError(problemResponse(500, { oops: true }, "Server Error"));

    expect(error.code).toBe(ErrorCodes.UNKNOWN);
  });

  it("trusts the HTTP status over a conflicting one in the body", async () => {
    const error = await parseUpstreamError(
      problemResponse(409, { title: "Conflict", status: 200, code: "DUPLICATE_REVIEW" }),
    );

    expect(error.status).toBe(409);
    expect(error.isConflict).toBe(true);
  });
});

describe("refresh decision", () => {
  async function errorFor(status: number, code: string, instance?: string) {
    return parseUpstreamError(problemResponse(status, { title: "t", status, code, instance }));
  }

  it("refreshes on TOKEN_EXPIRED", async () => {
    const error = await errorFor(401, ErrorCodes.TOKEN_EXPIRED, "/api/v1/cart");
    expect(error.shouldAttemptRefresh).toBe(true);
  });

  it("does not refresh on TOKEN_INVALID — the contract says to end the session", async () => {
    const error = await errorFor(401, ErrorCodes.TOKEN_INVALID, "/api/v1/cart");
    expect(error.shouldAttemptRefresh).toBe(false);
    expect(error.isSessionProblem).toBe(true);
  });

  it("does not refresh on TOKEN_MISSING — there is nothing to renew", async () => {
    const error = await errorFor(401, ErrorCodes.TOKEN_MISSING, "/api/v1/cart");
    expect(error.shouldAttemptRefresh).toBe(false);
    expect(error.isSessionProblem).toBe(true);
  });

  it("does not refresh on 403: the token is fine, the role is not", async () => {
    const error = await errorFor(403, ErrorCodes.INSUFFICIENT_ROLE, "/api/v1/admin/orders");
    expect(error.shouldAttemptRefresh).toBe(false);
    expect(error.isForbidden).toBe(true);
    expect(error.isSessionProblem).toBe(false);
  });

  it("treats a 401 dispatched from /error as a server fault, never a dead session", async () => {
    // Regression guard for 09-contract-notes.md item 17: a crash used to surface
    // as 401 TOKEN_MISSING, which would log the user out and hide the 500.
    const error = await errorFor(401, ErrorCodes.TOKEN_MISSING, "/error");

    expect(error.isServerFault).toBe(true);
    expect(error.isSessionProblem).toBe(false);
    expect(error.shouldAttemptRefresh).toBe(false);
  });

  it("still treats a genuine 401 on a real path as a session problem", async () => {
    const error = await errorFor(401, ErrorCodes.TOKEN_MISSING, "/api/v1/cart");
    expect(error.isSessionProblem).toBe(true);
    expect(error.isServerFault).toBe(false);
  });
});

describe("ApiError factories", () => {
  it("marks network failures as transport-level with no HTTP status", () => {
    const error = ApiError.network(new Error("ECONNREFUSED"));

    expect(error.status).toBe(0);
    expect(error.isTransport).toBe(true);
    expect(error.code).toBe(ErrorCodes.NETWORK_ERROR);
    expect(error.isSessionProblem).toBe(false);
  });

  it("reports the budget that elapsed on timeout", () => {
    const error = ApiError.timeout(10_000);

    expect(error.code).toBe(ErrorCodes.TIMEOUT);
    expect(error.message).toContain("10000");
  });

  it("is catchable as an Error and narrowable via isApiError", () => {
    const error: unknown = ApiError.network(new Error("boom"));

    expect(error).toBeInstanceOf(Error);
    expect(isApiError(error)).toBe(true);
    expect(isApiError(new Error("plain"))).toBe(false);
  });
});

describe("toResponseBody", () => {
  it("forwards code, message and field errors — but not the upstream path", async () => {
    // `instance` leaks internal routing; the browser has no use for it.
    const error = await parseUpstreamError(
      problemResponse(400, {
        title: "Bad Request",
        status: 400,
        code: "VALIDATION_ERROR",
        detail: "Validation failed",
        instance: "/api/v1/auth/register",
        errors: { email: ["must be a well-formed email address"] },
      }),
    );

    expect(error.toResponseBody()).toEqual({
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      fieldErrors: { email: ["must be a well-formed email address"] },
    });
  });
});
