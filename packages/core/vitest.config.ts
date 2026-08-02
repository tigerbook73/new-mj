import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    // 慢速冒烟（fuzz/property/全量回放）：日常 `pnpm test` 用 --tags-filter '!slow'
    // 排除，`pnpm test:full` 全量运行——docs/testing-strategy.md §1.2。
    tags: [
      {
        name: "slow",
        description: "慢速冒烟用例（fuzz/property），只在 test:full 运行",
        timeout: 120_000,
      },
    ],
  },
});
