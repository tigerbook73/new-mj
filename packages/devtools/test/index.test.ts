import assert from "node:assert/strict";
import test from "node:test";
import {
  firstAvailableWorktreeSlot,
  environmentLinkNames,
  parseWorktreeSlot,
  playwrightWorktreeRuntime,
  viteWorktreeServer,
  worktreeConfigFor,
  worktreeEnvironment,
} from "../src/index.ts";

test("worktree config derives the established port pairs", () => {
  assert.deepEqual(worktreeConfigFor(2), {
    slot: 2,
    devServerPort: 3002,
    devWebPort: 5175,
    e2eServerPort: 3102,
    e2eWebPort: 5276,
  });
  assert.equal(firstAvailableWorktreeSlot([0, 1, 3]), 2);
  assert.throws(() => parseWorktreeSlot("100"));
});

test("worktree environment wins over inherited conflicting ports", () => {
  const env = worktreeEnvironment(worktreeConfigFor(3), { PORT: "9999", KEEP: "yes" });
  assert.equal(env.PORT, "3003");
  assert.equal(env.VITE_SERVER_URL, "http://localhost:3003");
  assert.equal(env.E2E_WORKERS, "1");
  assert.equal(env.KEEP, "yes");
});

test("only ignored root .env.* files are selected for linking", () => {
  const names = environmentLinkNames(
    [
      { name: ".env.development.local", isLinkable: true },
      { name: ".env.production.local", isLinkable: true },
      { name: ".env.test", isLinkable: true },
      { name: ".env.example", isLinkable: true },
      { name: ".env", isLinkable: true },
      { name: ".env.directory", isLinkable: false },
    ],
    (name) => name.endsWith(".local"),
  );
  assert.deepEqual(names, [".env.development.local", ".env.production.local"]);
});

test("Vite adapter preserves direct-command defaults and validates configured ports", () => {
  assert.equal(viteWorktreeServer({}), undefined);
  assert.deepEqual(viteWorktreeServer({ VITE_PORT: "5175" }), { port: 5175, strictPort: true });
  assert.throws(() => viteWorktreeServer({ VITE_PORT: "invalid" }));
});

test("Playwright adapter preserves direct-command worker behavior", () => {
  assert.deepEqual(playwrightWorktreeRuntime({}), {
    webPort: 5274,
    serverPort: 3100,
    workers: undefined,
    baseURL: "http://localhost:5274",
  });
  assert.deepEqual(
    playwrightWorktreeRuntime({ E2E_WEB_PORT: "5278", E2E_SERVER_PORT: "3104", E2E_WORKERS: "1" }),
    {
      webPort: 5278,
      serverPort: 3104,
      workers: 1,
      baseURL: "http://localhost:5278",
    },
  );
  assert.throws(() => playwrightWorktreeRuntime({ E2E_WORKERS: "0" }));
});
