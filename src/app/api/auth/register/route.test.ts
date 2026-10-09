import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { ErrorCodes } from "@/lib/api/error-codes";
import { server } from "@/test/msw";
import { POST } from "./route";

const UPSTREAM = "http://127.0.0.1:9000/api/v1/auth/register";
const VALID = { name: "Ana Leitora", email: "ana@bookland.com", password: "senha1234" };

function register(body: unknown) {
  return POST(
    new Request("http://127.0.0.1:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/auth/register", () => {
  it("creates the account on the identity service, with no session", async () => {
    let sent: unknown;
    server.use(
      http.post(UPSTREAM, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          { id: "u1", email: VALID.email, name: VALID.name, role: "CUSTOMER" },
          { status: 201 },
        );
      }),
    );

    const response = await register({ ...VALID, confirmPassword: "senha1234" });

    expect(response.status).toBe(201);
    // Only the contract's three fields travel.
    expect(sent).toEqual(VALID);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("keeps a duplicate e-mail distinguishable", async () => {
    server.use(
      http.post(UPSTREAM, () =>
        HttpResponse.json(
          { title: "Conflict", status: 409, code: "EMAIL_ALREADY_EXISTS", detail: "taken" },
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const response = await register(VALID);

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(ErrorCodes.EMAIL_ALREADY_EXISTS);
  });

  it("refuses an incomplete body before calling upstream", async () => {
    const response = await register({ email: VALID.email });

    expect(response.status).toBe(400);
  });
});
