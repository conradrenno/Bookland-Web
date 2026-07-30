import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { ErrorCodes } from "./error-codes";
import { isApiError } from "./errors";
import { getOrderPayment } from "./payments";
import { server } from "@/test/msw";

const PAYMENTS_URL = "http://localhost:8080/api/v1/payments/order";
const TOKEN = "header.payload.signature";
const ORDER_ID = "f8bbf26e-28bb-46e0-a0a2-4aba8e674026";

const payment = {
  id: "7577a37c-0244-40fa-be1f-de8878043b8a",
  orderId: ORDER_ID,
  customerId: "224d5247-205a-4c88-868b-80672a010493",
  amount: 139.8,
  method: "PIX",
  status: "APPROVED",
  // The simulated gateway's marker — never shown to the customer.
  gatewayTransactionId: "SIM-1759835a-4e42-4f9c-8c01-646a62bcc6d5",
  createdAt: "2026-07-30T19:55:57.118195Z",
  updatedAt: "2026-07-30T19:55:57.118195Z",
};

describe("getOrderPayment", () => {
  it("returns the method the customer chose, which the order itself never carries", async () => {
    const seen: { auth?: string | null } = {};
    server.use(
      http.get(`${PAYMENTS_URL}/:orderId`, ({ request }) => {
        seen.auth = request.headers.get("Authorization");
        return HttpResponse.json(payment);
      }),
    );

    const result = await getOrderPayment(TOKEN, ORDER_ID);

    expect(seen.auth).toBe(`Bearer ${TOKEN}`);
    expect(result.method).toBe("PIX");
    expect(result.status).toBe("APPROVED");
  });

  it("fails loudly, leaving the caller to decide whether to hide the block", async () => {
    // The order page degrades — a payment it cannot read is a missing panel, not
    // a broken page. That choice belongs to the page, not to this function.
    server.use(
      http.get(`${PAYMENTS_URL}/:orderId`, () =>
        HttpResponse.json(
          {
            status: 404,
            title: "Not Found",
            detail: "Payment not found",
            code: "PAYMENT_NOT_FOUND",
            instance: `/api/v1/payments/order/${ORDER_ID}`,
          },
          { status: 404, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const error = await getOrderPayment(TOKEN, ORDER_ID).catch((e: unknown) => e);

    expect(isApiError(error) && error.isNotFound).toBe(true);
  });

  it("passes a session failure through untouched", async () => {
    server.use(
      http.get(`${PAYMENTS_URL}/:orderId`, () =>
        HttpResponse.json(
          {
            status: 401,
            title: "Unauthorized",
            detail: "Authentication required",
            code: ErrorCodes.TOKEN_MISSING,
            instance: `/api/v1/payments/order/${ORDER_ID}`,
          },
          { status: 401, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const error = await getOrderPayment(TOKEN, ORDER_ID).catch((e: unknown) => e);

    expect(isApiError(error) && error.isSessionProblem).toBe(true);
  });
});
