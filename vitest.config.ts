import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests, split in two projects (see docs/specs/10-testing.md).
 *
 * `node` — everything under `src/lib/**`: server-side logic with no DOM.
 * `jsdom` — `*.test.tsx`, the auth forms and future components.
 *
 * They are separate projects rather than one jsdom run so the server suite keeps
 * running at node speed: jsdom costs a real DOM per file, and none of `lib/`
 * needs one.
 */

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

// Smoke tests talk to a running Spring, so they are opt-in via `pnpm test:smoke`.
// Keeping them out of the default run means a stopped backend never turns the
// unit suite red.
const exclude = ["**/node_modules/**", "**/*.smoke.test.ts"];

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          // MSW server lifecycle, shared by every suite.
          setupFiles: ["src/test/msw.ts"],
          exclude,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          // Same MSW server: components hit the BFF routes through `fetch`, so
          // they are stubbed exactly like the server-side callers are.
          setupFiles: ["src/test/msw.ts", "src/test/dom.ts"],
          exclude,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/components/**/*.tsx"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/api/types.ts"],
    },
  },
});
