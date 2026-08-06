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
- 调参默认权重是数据、不是代码：`src/junk/default-weights.json`（`import ... with { type: "json" }`），`DEFAULT_JUNK_WEIGHTS` 从这个文件加载并 `Object.freeze`，不再手写字面量。`tune-cli.ts --write` 是唯一允许写这个文件的入口，且只在人工显式传了这个 flag、held-out 评估显示候选权重没有变差时才写——不自动、不默认。
- 自对弈/调参这类"跑很多局独立对局比大小"的场景优先考虑 `worker_threads` 并行（见 `src/junk/tune-pool.ts`）：把单场对局评估抽成一个纯函数（如 `tune.ts` 的 `runMatchTask`），worker 和顺序 fallback 调用同一份实现，保证并行结果和顺序结果必然一致（不是靠测试碰运气对齐）；worker pool 手写、不引入第三方库，同一个"这块小、没必要加依赖"的判断标准，见下条。
- `standardShanten`（`packages/core/src/lib/shanten.ts`）的递归 memo 可以通过可选参数在多次调用间共享——同一回合评估的候选手牌大多只差一张牌，递归子状态重叠很多，共享 memo 能把这些重叠转成缓存命中（不改变任何返回值，只影响缓存）。`scoreLegalActions` 每回合建一个 memo、贯穿整回合所有候选评估；新增会重复算向听数的路径时优先复用这个模式，而不是每次都建一个新的空 memo。

## DoD

- `pnpm --filter @new-mj/ai verify` 全绿（快速子集，慢速用例默认跳过）。
- 新增/修改自对弈或调参相关代码，提交前额外跑一次 `pnpm --filter @new-mj/ai verify:full`。
