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
- **AI 质量调优必须有 A/B 证据，不是建议、是硬性要求**：任何改变决策质量的改动（权重取值 or 打分公式/规则代码本身）在被采纳为新默认之前，**必须**拿出"A（现状）vs B（新方案）"的对比证据，不能只凭 code review 直觉判断"应该更好"；按改动类型二选一：
  1. **权重幅度类改动**：用自对弈胜率/分差做 A/B，复用 `tune.ts` 的 `evaluateCandidate`。`tune-cli.ts --write`（B 由 (1+1)-ES 搜索生成，内置 held-out 评估门槛）用于"搜一个更好的候选"；`compare-weights-cli.ts --candidate <path> [--baseline <path>]`（直接对比两组已经定好的具体权重，不跑搜索）用于"我已经有一组想验证的候选值"。两者都只打印报告、从不自动改 `default-weights.json`——确认站得住脚后手动覆盖并提交。B 候选文件在验证通过前不必进 git，指向系统 tmp 或会话 scratchpad 路径即可。
  2. **打分公式/规则代码改动**（如 `fanPotential` 新增一项、`shantenOf` 对副露的处理方式变化）：自对弈胜率的信噪比不足以分辨这类改动的"合理 vs 更优"（多次真实调参收敛到噪声而非信号，见 `mutate` 的 doc comment；2026-08-08 用三个种子交叉验证 `tenpaiProbabilityWeight` 重构又实测坐实了一次）——必须用场景化 fixture 测试断言"构造出的具体牌型在改动前后推荐动作的变化"（`strategy.test.ts` 里已有的回归测试都是这个模式），作为该改动的 A/B 证据，不要跑 `tune:junk` 去验证一个小的公式改动。`decision-diff:junk`（见下条）是这类改动**额外推荐**的前置侦察工具——先大范围抽样看决策变化是否符合直觉、校准新权重的起始量级，但它只是找线索用的，不能替代 fixture 断言作为最终证据。
- **跨版本/跨配置批量对比**（`src/junk/policy-loader.ts` 是三个工具共用的加载器）：
  - `compare-weights-cli.ts`/`decision-diff-cli.ts` 都支持 `--baseline-ref <git-ref>`/`--baseline-module <path>`（candidate 同理）——不只能换权重文件，也能换整份 `strategy.ts` 实现，跨代码版本对比。`ref` 用 `git show` 逐文件取快照（不需要 `git worktree`/`pnpm install`，见 `policy-loader.ts` 顶部注释），只适用于"改动没跨到 `@new-mj/core`"的场景（本来就是 AI 改进类改动的常态）。
  - `compare-weights-cli.ts`（胜率/积分对比，权重幅度类改动的主证据）和 `decision-diff:junk`（决策分歧对比，不比胜率、比"同一局面会不会选不同动作"，公式类改动的侦察工具，见上条）是互补的两个工具，不是二选一。
  - 两个都没提交、想互相对比的实验版本（还没到"哪个是历史哪个是新版"的地步，`ref` 用不上）：`pnpm snapshot:junk-ai <label>` 把当前 `src/junk/` 复制到 `packages/ai/.compare-scratch/<label>/junk/`（gitignored，刻意放在 `src`/`test` 外，不会被 `tsconfig.json`/`eslint src test` 扫到），之后继续在 `src/junk/` 原地改，用 `--baseline-module .compare-scratch/<label>/junk/strategy.ts` 对比——不需要复制完再恢复的手工操作。
- **以上所有工具（`tune-cli.ts --write` 除外）只打印报告，从不自动合并/覆盖任何文件**；`--write` 本身也要求人工显式传参且 held-out 评估不能变差。是否采纳某个候选，永远是人工看完报告后的手动决定，不存在任何自动合并路径。

## Calibration bench 框架

- `packages/ai/src/junk/calibration/` 是诊断/基线工具，不改变生产策略；`manifest`/`scenario` 是纯数据，执行逻辑由 provider、evaluator、runner 和 report 层承担。
- provider 负责来源数据的 schema/版本校验、TileKind→TileId 转换、`JunkPlayerView`/合法动作构造和 `contentHash`；evaluator 只负责评估已构造的输入；runner 只负责编排，不把领域评分、并发或文件 I/O 混入 evaluator。
- 少量 canonical manifest/fixture 使用 JSON；大量 generated、snapshot、replay 输入使用 JSONL。JSONL 首个非空行为 header，后续是自包含 scenario record；记录必须带 `schemaVersion`/`scenarioId`，文件按 manifest 版本和 shard 编号命名。
- JSONL reader 只做流式解析和基础字段校验，领域合法性仍由 provider 负责；批量聚合按 `scenarioId` 稳定排序，不能依赖输入或 worker 完成顺序。
- baseline 是版本化、不可由运行结果覆盖的资产，至少绑定 manifest/scenario 版本、`contentHash`、evaluator 版本和可比较决策；耗时等易波动指标默认只作信息记录。
- `evaluate` CLI 属于本 package；新增场景或 evaluator 应复用现有 provider/runner/report 契约，不复制临时命令、报告格式或 bench 框架代码。worker、重试、断点恢复属于 executor 层，不能散落在测试或 evaluator 中。

## DoD

- `pnpm --filter @new-mj/ai verify` 全绿（快速子集，慢速用例默认跳过）。
- 新增/修改自对弈或调参相关代码，提交前额外跑一次 `pnpm --filter @new-mj/ai verify:full`。
- 改动 AI 决策质量（权重或打分公式）的 commit，按上面的 A/B 规则附对比证据（自对弈报告摘要或 fixture 断言），不能只凭 code review 直觉判断"应该更好"。
