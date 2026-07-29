import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";

/**
 * Shared MSW server for unit tests.
 *
 * Intercepts at the network level, so the code under test calls `fetch` exactly
 * as it does in production — no injected transport, no patched globals. This is
 * the ecosystem-standard way to test HTTP in JS (docs/specs/10-testing.md).
 *
 * Registered as a Vitest `setupFile`, so every suite gets the lifecycle below
 * without repeating it.
 */
export const server = setupServer();

beforeAll(() => {
  // `error` rather than `warn`: a request nobody stubbed is a bug in the test,
  // and silently letting it hit the real network is how suites become flaky.
  server.listen({ onUnhandledRequest: "error" });
});

// Handlers are registered per-test with `server.use(...)`; resetting keeps one
// test's stubs from leaking into the next.
afterEach(() => server.resetHandlers());

afterAll(() => server.close());
