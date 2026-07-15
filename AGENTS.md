# AGENTS.md

在线麻将（非商用）。TS monorepo：packages/{core,protocol,ai} + apps/{server,web,mobile}。
**当前阶段：阶段 1 已完成；阶段 1.5 前先确认 `rules-bloodbattle.md` 定稿状态。**

## 会话仪式

- 开工：读 docs/plan.md 状态区
- 收工：把进度与"下一步第一个具体动作"写回 plan.md 并 commit

## Ground Truth（冲突以 docs 为准）

- 契约：docs/core-types-and-events.md · docs/protocol.md · docs/rules-junk.md（定稿）· docs/rules-bloodbattle.md（**草案**，实现前确认状态）
- 原理与取舍：docs/architecture.md · docs/decisions.md
- 流程细则（DoD/Git/验收）：docs/workflow.md；文档规则：docs/doc-map.md
- 阶段与待办：docs/plan.md

## 架构铁律（违反 = 错误，不是风格问题）

1. **core 是纯函数**：`applyAction(state, seat, action) → { state', events } | { error }`。core 内禁 `Date.now()`/`setTimeout`/`Math.random`（用 state.prng）/任何 I/O（lint 强制）。内部可用 class/immer，不得泄漏可变性。
2. **时间只在 server**：超时由 server 代提交 `pass`，与主动 pass 同型；deadline 在协议层附加；PlayerView 无时间字段。
3. **事件带可见性**（public/seat），server 按标注分发、不理解规则；**TileId 与牌面同级敏感**，public 事件不得携带可反查牌面的 id。
4. **身份只取自握手**：`socket.data.userId` 唯一来源，永不信任 payload 中的 userId。
5. **容器唯一性**：任一 TileId 物理上只归属一个容器（牌墙/手牌/牌河活跃条目/副露/胡牌快照）；被声明的牌入副露，牌河留墓碑。
6. **ack 与事件**：查询=ack 给数据；命令=ack 给回执、状态走事件广播（含本人、幂等）；进新上下文=ack 给快照。客户端不得依据命令 ack 更新状态。
7. **分层**（依赖规则强制）：`lib/` 不含玩法分支，复用以纯函数积木下沉为准（不是"提取公共接口方法"，D12）；`rulesets/*` 互不 import 对方流程代码；玩法内部地方细则用 config（D8 边界）；server/client 不实现规则（UI 由 myClaimOptions/getLegalActions 驱动）。
8. **core 代码约定**：公共/玩法/计分/事件常量按模块归拢；Action/State 类型保留可读字面量联合。`packages/core/src` 跨层引用使用包内 `@/*` alias，禁止直接 import 父级目录。

## DoD（细则见 workflow.md）

format:check + typecheck + lint + test 全绿并**贴出运行结果**；core 改动加 fuzz 冒烟（≥1000 局）。测试与实现同 commit；修 bug 先写复现用例。

- 依赖刷新与新增优先使用最新稳定版；若最新版本与现有工具链 peer 约束冲突，使用最新兼容稳定版并记录原因；同步 lockfile，完成 typecheck/lint/test 后再提交。

## 护栏

- 设计变更先改 docs 再改代码（同一 commit）；docs 与代码不一致 = bug
- 架构级问题（铁律/RuleSet 接口形状/协议语义）不自行决定，标 TODO 提回 Claude Project
- 不做清单：水平扩展/Redis、排行榜/ELO、观战、防作弊、崩溃恢复进行中对局、数据迁移

## 本文件规则

预算 100 行；新增须下沉等量内容到 docs；每阶段验收审计一次。阶段 1 骨架定型后在此补"代码地图"节（≤10 行）。

## 代码地图

- `packages/core/src/engine.ts`：engine-api 四签名（createGame/applyAction/getLegalActions/
  getPlayerView）+ ruleset 静态注册表。
- `packages/core/src/lib/`：无玩法立场纯函数积木（tiles/prng/wall/win/invariants/ids/seat）。
- `packages/core/src/rulesets/junk/`：junk 完整状态机、结算、PlayerView 派生、fuzz 入口
  （唯一完整实现）。
- `packages/core/src/rulesets/bloodbattle/`：血战前置阶段（换三张/定缺）、playing 状态机、番型计算和
  基础杠分/抢杠胡/呼叫转移；终局结算仍待补齐。
- `packages/core/src/{events,cli}.ts`：事件信封（root）、CLI 入口（薄壳，逻辑在
  rulesets/junk/fuzz.ts）。
