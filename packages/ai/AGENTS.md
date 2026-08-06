# packages/ai AGENTS.md

本文件只约束 `packages/ai`；根目录 `AGENTS.md` 的全局规则同样适用。

## package 职责

- 纯策略层：给定 core 的 `PlayerView`/`legalActions`，返回推荐动作；不实现任何规则，不缓存/持有 core state。
- 依赖方向单向 `ai → core`；`core` 不得反向依赖本包。

## 代码约定

- 决策函数（`recommendXxxAction`/`chooseXxxAction`）的强度/随机性通过显式可选参数注入（如 `JunkStrengthConfig.random`），默认 `Math.random` 零配置可用；自对弈/测试场景注入基于 `@new-mj/core` 的 `createPrng`/`nextUint32` 闭包换取可复现性。新增决策函数遵循同一约定，不要各自发明随机源。
- 测试文件位置遵循根 `docs/testing-strategy.md` §1.1：贴近实现的纯函数单测放 `src/`；跨模块/驱动 core 完整引擎的测试放 `test/`。
- 慢速用例（如 arena 跑几十局完整对局）按 §1.2 用 `{ tags: ["slow"] }` 标记，`pnpm test` 默认排除、`pnpm test:full`/`pnpm verify:full` 全量跑。
- 自对弈/调参驱动器（如 `src/junk/arena.ts`、`src/junk/tune.ts`）本身要有对应的 slow-tag 测试、走标准 `verify`/`verify:full` 链，证明管线跑得通；但**真正跑一次有意义的调参/大规模自对弈是人工触发的**，不进 `test`/`verify` 依赖链，只通过根 `package.json` 的便捷脚本（如 `tune:junk`）手动调用。两者都放在对应玩法目录 `src/` 内（保持被 `tsconfig.json`/`eslint` 覆盖），不从包的公共 `index.ts` barrel 导出。
- CLI 入口与算法实现分文件（参照 `packages/core/src/rulesets/junk/cli.ts` 的先例）：算法/纯函数放一个文件（可被测试直接 import，如 `tune.ts`），命令行参数解析 + 顶层 `process.argv`/`process.stdout` 副作用放另一个文件（如 `tune-cli.ts`）——避免测试文件 import 算法时意外触发脚本执行副作用。

## DoD

- `pnpm --filter @new-mj/ai verify` 全绿（快速子集，慢速用例默认跳过）。
- 新增/修改自对弈或调参相关代码，提交前额外跑一次 `pnpm --filter @new-mj/ai verify:full`。
