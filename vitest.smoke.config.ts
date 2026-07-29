import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Opt-in suite that exercises the layer against a **running** Spring on :8080.
 * Run with `pnpm test:smoke`.
 *
 * Standalone rather than merged with `vitest.config.ts`: `mergeConfig`
 * concatenates arrays, so the base `exclude` of `*.smoke.test.ts` would survive
 * and silently filter out the very files this config exists to run.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.smoke.test.ts"],
    exclude: ["**/node_modules/**"],
    // One upstream at a time: these tests log in and out of a shared account.
    fileParallelism: false,
  },
});
