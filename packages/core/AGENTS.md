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
- `src` 与 `test` 内跨层引用使用 package-local `@/*` alias，禁止直接 import 父级目录。
- package 集成/契约/fuzz 测试放在 `test/`，测试文件命名为 `*.test.ts`；只有真正贴近实现细节的单元测试才就近放在 `src/`。

## 代码地图

- `src/engine.ts`：engine API 四签名与 ruleset 静态注册表。
- `src/lib/`：tiles、prng、wall、win、invariants、ids、seat 等通用积木。
- `src/rulesets/junk/`：完整 junk 状态机、结算、PlayerView 与 fuzz。
- `src/rulesets/bloodbattle/`：血战前置、playing、番型、杠分/抢杠胡/呼叫转移、流局结算和 1000 局 fuzz。
- `src/events.ts`：事件信封与事件类型常量；`src/cli.ts`：CLI 薄壳。

## core DoD

- 修改后必须通过 `pnpm --filter @new-mj/core verify`。
- core 改动必须跑 fuzz 冒烟，至少 1000 局；测试与实现同一 commit。
