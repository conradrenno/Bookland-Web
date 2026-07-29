/**
 * DOM-test setup, loaded only by the `jsdom` project (see vitest.config.ts).
 *
 * Testing Library's automatic cleanup only registers itself when `afterEach` is
 * a global, which it is not here — we run without `globals: true` so test files
 * import what they use. Registering it explicitly keeps one test's markup from
 * leaking into the next.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
