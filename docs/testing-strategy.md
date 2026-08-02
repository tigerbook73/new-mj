# 测试策略

> 新增文档：把原来散落在 `_legacy/workflow.md`（DoD）、`_legacy/decisions.md`（评审点 D8）、`_legacy/rules-bloodbattle.md`（fixture 约定）里的测试相关内容收拢成一份策略，先定后做。新增玩法开工前应先满足本文档的最低要求，而不是现场讨论测什么、测多少。

## 1. 分层

| 层           | 覆盖什么                                          | 工具                                                                              |
| ------------ | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| 单元         | core 纯函数（不变量、单个规则判定）               | Vitest（`packages/core`）                                                         |
| fixture      | 番型/规则黄金路径用例（人工设计，覆盖已知规则点） | Vitest，fixture 为内联 TS 数组字面量（`test.each`）                               |
| fuzz         | 随机 config 扫组合，暴露黄金路径没覆盖到的边界    | Vitest，seed + action 序列可复现                                                  |
| e2e          | 真实 socket.io-client 连接跑通完整会话            | Jest（`apps/server`，遵循 NestJS 官方测试生态）                                   |
| 跨玩法不变量 | 容器唯一性、事件重建≡直接派生                     | 参数化遍历已注册 ruleset（`packages/core/test/cross-ruleset-invariants.test.ts`） |

web/mobile 使用各自框架的测试工具；跨包测试从根脚本统一调度（Turbo）。

### 1.1 测试文件位置与命名（全 package 统一原则）

- **位置**：单元测试贴近实现放 `src/`（只放真正贴近实现细节、不跨模块的用例）；集成/契约/fuzz/e2e 等跨模块或跨进程测试放独立的 `test/` 目录。这条原则对 `packages/core`、`packages/protocol`、`packages/ai`、`apps/web`、`apps/server` 一致适用。
- **命名后缀随包内测试框架而定**：Vitest 生态（`packages/core`、`packages/protocol`、`packages/ai`、`apps/web` 单元测试）统一用 `*.test.ts`（`apps/web` 组件测试用 `*.test.tsx`）；`apps/server` 遵循 NestJS 官方 Jest 生态，单元测试用 `*.spec.ts` 与源码同目录。
- **e2e 统一放 `test/*.e2e-spec.ts`**：`apps/server`（`socket.io-client` 模拟客户端）与 `apps/web`（Playwright）在这条命名上刻意保持一致，便于跨包查找。

### 1.2 慢速用例分层（`@slow` tag）

与 e2e 的 `@slow`/`test:e2e:full` 同一约定（`process/workflow.md`），应用到 Vitest 单测/fuzz：

- **判定标准**：单用例运行秒级以上的 fuzz / property / 全量回放冒烟（如 1000 局 fuzz、万局扫描、全量 ukeire property）标记为慢速；普通 fixture/单元用例不标。
- **标记方式**：Vitest 一等 test tag（4.1+）——`vitest.config.ts` 的 `test.tags` 声明 `{ name: "slow", timeout: … }`（timeout 由 tag 统一提供，慢速用例不再各自写位置参数），用例用 `test("…", { tags: ["slow"] }, fn)` 标记。快速 `test` 脚本以 `--tags-filter '!slow'` 排除（显示为 skipped），`test:full` 不筛选、跑全部。
- **脚本约定**：有慢速用例的 workspace（当前 `packages/core`）提供 `test:full`/`verify:full`；没有的 workspace `test:full` 等于 `test`（与 `apps/server` 的 `test:e2e:full` 别名同理，不强行拆分）。根 `pnpm verify` 用快速子集，`pnpm verify:full` 用 `test:full` + `test:e2e:full`。
- **DoD 挂钩**：日常迭代跑 `verify`；core 改动提交前必须跑 core 的 `verify:full`（fuzz 冒烟 ≥1000 局在 `test:full` 中），合并到 main 前跑根 `verify:full`。

## 2. 黄金路径 vs fuzz 的分工原则

- 测试以**标准配置**为黄金路径：每个番型/规则点至少 1 正例、1 边界例、1 与相邻规则的区分例，人工设计，追求可读性和覆盖已知规则点。
- fuzz 用随机 config 扫组合，不追求可读性，追求把黄金路径没想到的边界情况炸出来（变体之间是 RuleSet 代码，变体之内的地方细则是 config 数据，fuzz 随机 config 覆盖组合爆炸）。
- 不追覆盖率指标；追不变量全时校验 + 胡牌/番型用例表全绿。
- fuzz 失败：seed + action log 先固化为回归用例，再修复——不允许"改到不报错为止"。

## 3. 新增玩法最低验收清单

新增一个 `variants/<id>.md` 并接入代码时，进入下一阶段前必须满足：

- [ ] 番型/规则 fixture：每个规则点至少 1 正例 + 1 边界例 + 1 区分例，负例带机器可读 `reason`
- [ ] 该玩法独立 fuzz ≥ 1000 局冒烟通过（按 §1.2 标记为慢速用例，经 `test:full` 运行）；阶段收尾前跑满 ≥ 1 万局（随机 config）
- [ ] 已注册进跨玩法不变量测试（容器唯一性、事件重建≡直接派生）
- [ ] 若涉及 `architecture/variant-boundary.md` 中标注"需要验证"的机制（庄家轮换、会话排名等），本次接入的结论要回写台账的"已验证玩法数"列
- [ ] 根目录 `pnpm verify`（format:check、typecheck、lint、test）全绿；接入收尾再跑一次根 `pnpm verify:full`（含慢速用例与 e2e 全量）

## 4. 与 DoD 的挂钩

任务宣称完成前，除本文档的分层测试要求外，仍需满足 `process/workflow.md` 的完成定义（DoD）：typecheck、lint、受影响包测试全绿并贴出运行结果；core 改动的 fuzz 阈值以本文档 §3 为准（比 workflow.md 原有表述更具体地绑定到"新增玩法"场景）。

## 5. 测试与文档的关系

- 契约和规则正文以 `contracts/*.md`、`variants/*.md` 为准，测试代码里的注释不复制整段规格。
- fixture 数据本身（内联 TS 用例数组）是权威测试输入，不在文档里重复贴运行结果；文档只讲"怎么写 fixture、约定是什么"（如 `variants/bloodbattle.md` §10 的 fixture 格式约定）。
