/**
 * Contract smoke tests — the only suite that talks to a real Spring.
 *
 * Opt-in via `pnpm test:smoke` with the backend up on :8080; excluded from
 * `pnpm test` so a stopped backend never reddens the unit suite. Purpose is to
 * catch the API drifting away from what docs/specs/09-contract-notes.md records,
 * which unit tests against MSW stubs cannot see.
 *
 * Uses the dev-profile admin seed (see application.yml `bookland.admin.*`).
 */
import { describe, expect, it } from "vitest";

import { apiFetch } from "./client";
import { ErrorCodes } from "./error-codes";
import { isApiError } from "./errors";
import type { BookViewModel, PageResult, TokenViewModel } from "./types";

describe("live API smoke", () => {
  it("GET /books with query params", async () => {
    const page = await apiFetch<PageResult<BookViewModel>>("/api/v1/books", {
      query: { size: 2, page: 0, sort: "title" },
    });
    expect(page.content.length).toBe(2);
    expect(page.content[0].coverImageUrl).toBeTruthy();
  });

  it("401 problem+json becomes a session problem", async () => {
    const error = await apiFetch("/api/v1/cart").catch((e: unknown) => e);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.TOKEN_MISSING);
    expect(isApiError(error) && error.isSessionProblem).toBe(true);
  });

  it("validation error arrives with per-field messages", async () => {
    const error = await apiFetch("/api/v1/auth/register", {
      method: "POST",
      body: { name: "", email: "nope", password: "a" },
    }).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(isApiError(error) && error.messagesFor("email")).toBeDefined();
    expect(isApiError(error) && error.isFieldScoped).toBe(true);
  });

  it("login + authenticated GET + 204 logout", async () => {
    const token = await apiFetch<TokenViewModel>("/api/v1/auth/login", {
      method: "POST",
      body: { email: "admin@bookland.com", password: "admin1234" },
    });
    expect(token.accessToken).toBeTruthy();

    const cart = await apiFetch<{ customerId: string }>("/api/v1/cart", {
      accessToken: token.accessToken,
    });
    expect(cart.customerId).toBeTruthy();

    const logout = await apiFetch<void>("/api/v1/auth/logout", {
      method: "POST",
      body: { refreshToken: token.refreshToken },
    });
    expect(logout).toBeUndefined();
  });

  it("an invalid token is a refreshable session problem, not a permission one", async () => {
    const error = await apiFetch("/api/v1/admin/orders", {
      accessToken: "garbage.token.here",
    }).catch((e: unknown) => e);
    expect(isApiError(error) && error.code).toBe(ErrorCodes.TOKEN_INVALID);
    expect(isApiError(error) && error.shouldAttemptRefresh).toBe(true);
  });
});
