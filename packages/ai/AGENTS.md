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
- 用 `node --cpu-prof` 对着单线程跑一批 `runMatchTask` 找过热点：`packages/core` 里 `tileSet.kinds.indexOf(...)` 这类线性扫描曾占掉大头（见 `packages/core/AGENTS.md` 的 `kindIndexOf` 记录）；这个手法可复用——怀疑哪条路径慢，先 profile 拿数据，不要凭直觉猜。
- `tuneJunkWeights` 自己判断收敛并提前停（sigma 缩到阈值以下，或连续多代没有变异被接受），不要求调用方猜一个"够用"的 `--max-generations`——那只是安全上限。新增迭代式搜索/训练循环时优先复用"步长/停滞收敛信号 + 硬顶"这个模式，而不是让调用方自己试错代数。
- **AI 质量调优要有 A/B 证据，不能凭感觉替换默认值**：任何改变决策质量的改动（权重取值 or 打分公式/规则代码本身）在被采纳为新默认之前，都要能拿出"A（现状）vs B（新方案）"的对比证据，按改动类型二选一：
  1. **权重幅度类改动**：用自对弈胜率/分差做 A/B，复用 `tune.ts` 的 `evaluateCandidate`。`tune-cli.ts --write`（B 由 (1+1)-ES 搜索生成，内置 held-out 评估门槛）用于"搜一个更好的候选"；`compare-weights-cli.ts --candidate <path> [--baseline <path>]`（直接对比两组已经定好的具体权重，不跑搜索）用于"我已经有一组想验证的候选值"。两者都只打印报告、从不自动改 `default-weights.json`——确认站得住脚后手动覆盖并提交。B 候选文件在验证通过前不必进 git，指向系统 tmp 或会话 scratchpad 路径即可。
  2. **打分公式/规则代码改动**（如 `fanPotential` 新增一项、`shantenOf` 对副露的处理方式变化）：自对弈胜率的信噪比不足以分辨这类改动的"合理 vs 更优"（多次真实调参收敛到噪声而非信号，见 `mutate` 的 doc comment）——改用场景化 fixture 测试断言"构造出的具体牌型在改动前后推荐动作的变化"（`strategy.test.ts` 里已有的回归测试都是这个模式），作为该改动的 A/B 证据，不要跑 `tune:junk` 去验证一个小的公式改动。

## DoD

- `pnpm --filter @new-mj/ai verify` 全绿（快速子集，慢速用例默认跳过）。
- 新增/修改自对弈或调参相关代码，提交前额外跑一次 `pnpm --filter @new-mj/ai verify:full`。
- 改动 AI 决策质量（权重或打分公式）的 commit，按上面的 A/B 规则附对比证据（自对弈报告摘要或 fixture 断言），不能只凭 code review 直觉判断"应该更好"。
