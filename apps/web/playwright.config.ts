import { defineConfig, devices } from "@playwright/test";

/**
 * Dedicated e2e ports, distinct from the dev-mode defaults (web 5173,
 * server 3000) so a running `pnpm dev` isn't disturbed by e2e runs and
 * vice versa — Playwright boots its own web + server pair here.
 */
function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error(`${name} must be an integer TCP port; received ${raw}`);
  return port;
}

function readWorkers(): number | undefined {
  const raw = process.env["E2E_WORKERS"];
  if (!raw) return undefined;
  const workers = Number(raw);
  if (!Number.isInteger(workers) || workers < 1)
    throw new Error(`E2E_WORKERS must be a positive integer; received ${raw}`);
  return workers;
}

const WEB_PORT = readPort("E2E_WEB_PORT", 5274);
const SERVER_PORT = readPort("E2E_SERVER_PORT", 3100);
const WORKERS = readWorkers();

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.e2e-spec.ts",
  fullyParallel: true,
  workers: WORKERS,
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
      // NODE_ENV=test makes dotenv-flow load .env.test (blanks Supabase/DB vars) and skip .env.development.local.
      env: { PORT: String(SERVER_PORT), NODE_ENV: "test", TEST_GAME_SEED: "121" },
      stdout: "ignore",
      stderr: "pipe",
      timeout: 180_000,
      wait: { stdout: /Nest application successfully started/ },
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort --mode test`,
      // JWT_SECRET intentionally not set (shared dev-only fallback, D16); --mode test loads .env.test the same way as the server entry above.
      env: { VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
      stdout: "ignore",
      stderr: "pipe",
      timeout: 60_000,
      wait: { stdout: new RegExp(`Local:\\s+http:\\/\\/localhost:${WEB_PORT}`) },
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
