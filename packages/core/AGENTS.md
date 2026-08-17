# packages/core AGENTS.md

本文件只约束 `packages/core`；根目录 `AGENTS.md` 的全局规则同样适用。

## package 职责

- core 是纯函数规则引擎：`applyAction(state, seat, action) → { state, events } | { error }`。
- 禁止 `Date.now()`、`setTimeout`、`Math.random` 和任何 I/O；随机性只能来自 `state.prng`。
- 内部可用 class/immer，但不得把可变性泄漏到调用方。
- server/client 不实现规则；规则分支留在 `rulesets/*`，通用纯函数下沉到 `lib/`。

## 代码约定

- `src/lib/` 只放不带玩法立场的纯函数积木；`rulesets/*` 不 import 其他 ruleset 的流程代码。
- 公共、玩法、计分、事件常量按模块归拢；Action/State 类型保留可读字面量联合。
- `src` 与 `test` 内跨层引用一律用相对路径 + `.ts` 后缀（不用 `@/*` alias——Node 原生 `require()`/Vite 都不认识 tsconfig `paths`）。这也是 `development` export 条件下 server/web 能直接消费本包 `src` 源码、生产态仍消费 `dist` 的前提：只监听 `dist/*.d.ts` 曾实测在"改实现不改签名"时不触发 `tsc --watch` 重新编译，改成让真实源码进入监听范围更可靠。
- 测试文件位置/命名遵循根 AGENTS.md 全局约定（`docs/testing-strategy.md` §1.1）；无 core 专属偏离。
- 已导出的领域状态、事件和跨模块结果优先定义专门的 `type`/`interface`；这样可复用、可被契约引用，并减少后续接口调整时的漂移。
- 仅在模块内部使用、语义一次性且不会成为跨包契约的简单结果，允许使用内联返回类型；不为形式统一而制造无意义类型名。
- 注释只补充代码无法表达的算法、不变量、敏感性或边界语义；契约和规则正文仍以 `contracts/`、`variants/` 为准，不在代码注释中复制整段规格。
- 本包新增或修改的代码注释统一使用中文；不引用会被清理的 `docs/process/plan.md`，稳定规则分流到契约或玩法文档。
- 牌种反查用 `TileSet.kindIndexOf(kind)`（O(1)），不要在热路径（如递归搜索）里用 `tileSet.kinds.indexOf(kind)`（O(kinds.length) 线性扫描）。

## 代码地图

- `src/engine.ts`：engine API 六个 dispatch 签名，只读 `ruleset-registry.ts` 做分发。
- `src/ruleset-registry.ts`：唯一运行时 `rulesetId → RulesetModule` 登记表；`engine.ts` 与 `support/registered-rulesets.ts`（测试适配）都从这里派生，新增玩法只改这一处。
- `src/lib/`：tiles、prng、wall、standard-hand（标准无癞子胡牌判断，非通用 TileSet 算法）、invariants、ids、seats、seat-state 等通用积木。
- `src/rulesets/junk/`：完整 junk 状态机、结算、PlayerView 与 fuzz。
- `src/rulesets/bloodbattle/`：血战前置、playing、番型、杠分/抢杠胡/呼叫转移、流局结算和 100 局 fuzz。
- `src/events.ts`：事件信封与可见性工具；`rulesets/<id>/events.ts`：玩法事件名；`rulesets/junk/cli.ts`：junk 开发/诊断 CLI。

## core DoD

- 修改后必须通过 `pnpm --filter @new-mj/core verify`（快速子集，打 `slow` tag 的 fuzz/property 用例默认排除）。
- core 改动必须跑 fuzz 冒烟，至少 100 局：提交前跑 `pnpm --filter @new-mj/core verify:full`（`test:full` 不筛选、含全部 `slow` tag 用例，见 `docs/testing-strategy.md` §1.2）；测试与实现同一 commit。
