import { defineConfig, devices } from "@playwright/test";

/**
 * Dedicated e2e ports, distinct from the dev-mode defaults (web 5173,
 * server 3000) so a running `pnpm dev` isn't disturbed by e2e runs and
 * vice versa — Playwright boots its own web + server pair here.
 */
const WEB_PORT = 5274;
const SERVER_PORT = 3100;

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.e2e-spec.ts",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
  },
  webServer: [
    {
      // No `port`/`url` here on purpose: whenever either is set, Playwright
      // does a TCP probe to check "is something already there" *before*
      // spawning — regardless of reuseExistingServer's value, it still
      // connects first to decide reuse-vs-throw (or reuse-vs-start). In this
      // sandbox, connecting to a port nothing is listening on doesn't get
      // an instant refusal like normal loopback does — it hangs for 2+
      // minutes (observed: 2m22s) before ECONNREFUSED, consistent with SYN
      // packets being silently dropped rather than rejected, forcing a full
      // TCP retry-exhaustion timeout. `wait.stdout` sidesteps this
      // entirely: readiness is decided by watching the child's own log
      // output, no socket connect involved.
      //
      // stdout:"ignore" keeps routine NestJS/Vite boot logs out of the test
      // report; Playwright still matches `wait.stdout` against the stream
      // internally regardless of this setting (verified: readiness
      // detection and the ~5-8s runtime are unaffected). stderr stays piped
      // so an actual crash is still visible.
      command: "pnpm --filter @new-mj/server start",
      env: { PORT: String(SERVER_PORT) },
      stdout: "ignore",
      stderr: "pipe",
      timeout: 180_000,
      wait: { stdout: /Nest application successfully started/ },
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      // JWT_SECRET intentionally not overridden: web's dev-mode fake login
      // (D16) and server's ConfigService.jwtSecret share the same
      // dev-only-insecure-secret fallback when unset, so no coordination
      // is needed here — only the connection URL differs for e2e.
      env: { VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
      stdout: "ignore",
      stderr: "pipe",
      timeout: 60_000,
      wait: { stdout: /Local:\s+http:\/\/localhost:5274/ },
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
