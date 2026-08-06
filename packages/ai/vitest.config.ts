import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 慢速冒烟（自对弈 arena 跑多局真实对局）：日常 `pnpm test` 用 --tags-filter
    // '!slow' 排除，`pnpm test:full` 全量运行——docs/testing-strategy.md §1.2。
    tags: [
      {
        name: "slow",
        description: "慢速冒烟用例（自对弈 arena 多局），只在 test:full 运行",
        timeout: 120_000,
      },
    ],
  },
});
