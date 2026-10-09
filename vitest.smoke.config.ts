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
// The OAuth2 client secret (and any URL overrides) from `.env.local`, as
// `next dev` would read them. Workers inherit this process's environment.
// Absent file is fine: the variables may come from the shell instead.
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local
}

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
    // One upstream at a time: these tests share a running backend.
    fileParallelism: false,
  },
});
