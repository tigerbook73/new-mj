# packages/ai AGENTS.md

本文件只约束 `packages/ai`；根目录 `AGENTS.md` 的全局规则同样适用。

## package 职责

- 纯策略层：给定 core 的 `PlayerView`/`legalActions`，返回推荐动作；不实现任何规则。决策函数本身保持纯函数、不隐式持有跨调用状态；允许提供调用方显式实例化、显式持有生命周期的有状态封装（如 `JunkBotAgent`），但这类封装不能是模块级单例或藏在纯函数内部的隐藏缓存，底层纯函数入口必须始终可以脱离它独立调用并保持确定性。评估/自对弈框架（`src/evaluation/`、arena、policy-loader）只消费纯函数，不依赖、不感知这类封装。
- 依赖方向单向 `ai → core`；`core` 不得反向依赖本包。

## 代码约定

- `junk/shanten/` 是从 `packages/core` 迁移来的向听/进张计算（手牌质量启发式，不是规则合法性判断，core 自己的 ruleset 从不消费它）；牌种反查用 `TileSet.kindIndexOf(kind)`（O(1)），不要在热路径（如 `junk/shanten/` 内的递归/DP 搜索）里用 `tileSet.kinds.indexOf(kind)`（O(kinds.length) 线性扫描）——自对弈调参对 `junk/shanten/shanten.ts` 做过 profiling，这个模式曾占单次运行 ~11% 的自耗时。

## 生产代码

- 决策函数只消费 core 的 view/actions；强度与随机性通过可选参数注入，默认 `Math.random`，测试与自对弈注入基于 core PRNG 的闭包。
- Junk 默认生产使用普通标准型 + 七对 + 门清 claim 阈值 + 碰碰胡弃牌 tiebreak 的无权重结构 facade（七对接入范围与惩罚设计见 `docs/architecture/shanten.md`"七对结构路线"节，门清阈值见同文件"门清 claim 阈值"节，碰碰胡见同文件"碰碰胡结构路线"节）；`strategy.ts` 是稳定加载根，只保留最终动作选择并重导结构诊断 API。生产路径不得 import `evaluation/`。
- 当前生产策略身份由 `JUNK_STRUCTURAL_BASELINE` 固定；有意改变 canonical 行为时新建 baseline 版本及对照资产，不静默改写既有版本。
- 不保留生产权重、旧加权评分闭包或调权入口；后续演进通过结构 baseline/candidate 比较完成。
- `junk/bot-agent.ts` 的 `JunkBotAgent` 是生产诊断用的有状态封装（每座位一个实例，由 `apps/server` 创建/持有/清理），内部只调用 `structural-baseline.ts` 的纯函数；新增字段前先确认调用方（server）真的需要，不预先占位。

## 测试与性能

- 测试位置遵循 `docs/testing-strategy.md`：贴近实现的纯函数单测放 `src/`，跨模块/完整引擎测试放 `test/`。
- 慢速用例使用 `{ tags: ["slow"] }`；普通 `test`/`verify` 排除，`test:full`/`verify:full` 纳入。大规模调参、自对弈和全量扫描只走人工 `evaluate` 命令，不进入测试链。
- 性能判断先用 `node --cpu-prof` 对固定单线程任务取证。并行 match 必须让 worker 与顺序 fallback 调用同一纯函数；迭代搜索同时保留收敛信号与硬上限。

## 质量变更

- candidate 成为新 baseline 前必须有场景化 fixture、policy diff、同 seed 换位对局和性能证据，不能只凭 code review 直觉；`evaluate policy diff` 只用于前置侦察，不能替代 fixture。
- `policy-loader` 支持 Git ref 和显式 `strategy.ts` module；未提交版本用 `evaluate policy capture` 保存完整生产闭包。跨 ref 比较只适用于未跨越 `@new-mj/core` 的改动。
- evaluation 工具只写报告，不自动采纳候选或修改生产策略。

## Evaluation 框架

- `src/evaluation/` 提供玩法无关的 types、runner、report/comparator、JSONL、executor/worker 和 resumable batch；`src/junk/evaluation/` 只绑定 Junk provider、evaluator、fixture/baseline 与 CLI。详细命令和当前来源支持见 `src/junk/evaluation/README.md`。
- provider 校验来源 schema/版本并构造规范化输入与 `contentHash`；evaluator 只计算；runner 只编排；report/comparator 只持久化和比较。不得把领域评分、并发或文件 I/O 混入 evaluator。
- canonical manifest、fixture 和固定 snapshot 使用版本化 JSON；批量 generated/snapshot/replay 输入使用带 header 的自包含 JSONL。reader 只做流式语法/基础字段校验，领域合法性由 provider 负责，结果始终按 `scenarioId` 稳定排序。
- baseline 是只读版本化资产，绑定 scenario/content hash/evaluator 与可比较决策；运行结果不得覆盖 baseline，耗时等易波动指标只作信息记录。
- policy loader 默认加载模块自己的 `chooseJunkAction`，并以可选 export 名支持 baseline/candidate；通用 worker pool 不理解任务字段或策略范式。
- `executor.ts`/`worker.ts` 只负责执行；`batch.ts` 负责 manifest/header 校验、chunk、checkpoint schema/store 与 hash-safe resume。确定性失败写入结果，不自动 retry；玩法 CLI 只绑定 resolver、task 与输出命名。
- CLI 顶层副作用只放在 `cli-entry.ts`；`commands/` handler 可直接测试，算法放 `policy/` 或 `match/`。evaluation 工具不从公共 package barrel 导出。
- 通用契约测试放 `src/evaluation/`；Junk provider/CLI 单测放 `src/junk/evaluation/`；真实 evaluator/baseline/worker 接线放 `test/`；策略牌理 fixture 留在 `strategy.test.ts`，结构指标留在独立测试文件。

## DoD

- `pnpm --filter @new-mj/ai verify` 全绿（快速子集，慢速用例默认跳过）。
- 新增/修改自对弈或调参相关代码，提交前额外跑一次 `pnpm --filter @new-mj/ai verify:full`。
- 改动 AI 决策质量（权重或打分公式）的 commit，按上面的 A/B 规则附对比证据（自对弈报告摘要或 fixture 断言），不能只凭 code review 直觉判断"应该更好"。
