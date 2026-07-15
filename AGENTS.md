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

1. **时间只在 server**：超时由 server 代提交 `pass`，与主动 pass 同型；deadline 在协议层附加；PlayerView 无时间字段。
2. **事件带可见性**（public/seat），server 按标注分发、不理解规则；**TileId 与牌面同级敏感**，public 事件不得携带可反查牌面的 id。
3. **身份只取自握手**：`socket.data.userId` 唯一来源，永不信任 payload 中的 userId。
4. **容器唯一性**：任一 TileId 物理上只归属一个容器（牌墙/手牌/牌河活跃条目/副露/胡牌快照）；被声明的牌入副露，牌河留墓碑。
5. **ack 与事件**：查询=ack 给数据；命令=ack 给回执、状态走事件广播（含本人、幂等）；进新上下文=ack 给快照。客户端不得依据命令 ack 更新状态。
6. **分层**：规则实现集中在 core；server/client 不实现规则，UI 由 core 的 `myClaimOptions`/`getLegalActions` 驱动；跨 package 的依赖方向以 docs 契约为准。

## DoD（细则见 workflow.md）

默认执行 `pnpm verify` 并全绿，提交时**贴出运行结果**；core 改动加 fuzz 冒烟（≥1000 局）。测试与实现同 commit；修 bug 先写复现用例。

- 依赖刷新与新增优先使用最新稳定版；若最新版本与现有工具链 peer 约束冲突，使用最新兼容稳定版并记录原因；同步 lockfile，完成 typecheck/lint/test 后再提交。

## 护栏

- 设计变更先改 docs 再改代码（同一 commit）；docs 与代码不一致 = bug
- 架构级问题（铁律/RuleSet 接口形状/协议语义）不自行决定，标 TODO 提回 Claude Project
- 不做清单：水平扩展/Redis、排行榜/ELO、观战、防作弊、崩溃恢复进行中对局、数据迁移

## 本文件规则

本文件只放根目录及跨 package 全局有效的规则；package 专属约束放在对应目录的 `AGENTS.md`。预算 100 行；新增须下沉等量内容到 docs；每阶段验收审计一次。
