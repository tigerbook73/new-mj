# 架构总览

> 叙事文档：讲"系统怎么运转、为什么这样设计"。契约细节一律见规格文档（本文不重复）。

## 1. 系统图

```
 web (React SPA)      mobile (Expo, 后期)
        \                /
         Socket.IO（唯一业务通道；OAuth 走 Supabase SDK 直连）
                 |
   server (NestJS)：GameRoom = 有状态对象
   ├─ 握手鉴权（JWT → socket.data.userId）
   ├─ RoomManager（单进程内存 Map）
   ├─ 计时器（超时代提交 pass；deadline 广播）
   └─ 事件分发（按可见性过滤）
                 |
   core（纯函数引擎，零依赖）
   applyAction(state, seat, action) → { state', events } | { error }
                 |
   PG(Supabase)：用户表 + 对局事件日志（阶段 4）
```

## 2. 包拓扑（依赖方向 = 架构本体，dependency-cruiser 强制）

```
core ← ai            core：零依赖（纯函数可测试性的前提）
core ← server → protocol
        web/mobile → protocol（只依赖协议与类型，不 import 引擎实现）
```

模块系统：`apps/server` 是仓库里唯一的 CommonJS 包（其余 ESM），跟随 NestJS 官方默认构建方式；`core`/`protocol` 用 tsup 双发 CJS+ESM 兼容两边（D13）。

## 3. 一条动作的旅程

玩家点"碰"：client 发 `game:action {peng}`（ack 仅回执受理）→ Room 将其入队（每房间串行）→ 调 `applyAction` → 得到新 state 与 events → Room 替换 state 引用 → 按每个事件的 visibility 标注分发（含发起者本人）→ 各客户端把事件应用到本地视图。客户端状态永远 = 入局快照 + 事件流；服务端持唯一权威 GameState。

## 4. 核心概念

**事件溯源 + seed 可复现**：洗牌用 state 内可序列化 PRNG；任何一局 = seed + action 序列，可重放调试。事件带 seq 与可见性（public/seat），事件日志天然支持任意玩家视角与上帝视角回放。摸牌是引擎自动转移，非玩家动作。

**core 分层：engine-api 外壳 + rulesets/\* 独立状态机 + lib 积木**（D12）：`createGame`/`applyAction`/`getLegalActions`/`getPlayerView` 四签名与事件信封是唯一冻结契约，本身不理解任何玩法；每个玩法（`rulesets/junk`、`rulesets/bloodbattle`……）实现自己完整的回合循环、自有 Action/Phase/State，互不 import 对方的流程代码；`lib/` 只收无玩法立场的纯函数积木（牌墙/PRNG/手牌分解/容器不变量）。变体之间用独立的 ruleset 模块（代码），变体之内的地方细则仍用 config（数据）——这条边界不受 D12 影响（D8）。`variantState` 命名空间已撤销：规则状态本身就是完整状态，不再需要一层私有命名空间去隔离。

**可见性模型**：他人手牌、牌墙对客户端不存在——server 只下发 `getPlayerView(state, seat)` 的产物。TileId 与牌面同级敏感。AI 与真人同构：AI 只消费 PlayerView + getLegalActions，物理上无法作弊。

**声明窗口与时间边界**：一家出牌后，仅"有合法响应"的座位进入窗口，按 RuleSet 优先级表确定性裁决（垃圾胡：胡>杠>碰>吃）。core 无时间概念；超时由 server 计时并代提交 pass，与主动 pass 同型。

**客户端状态与重连**：命令 ack 只回执，状态一律走事件（广播含本人，幂等应用）；进新上下文（入房/重连）ack 给快照。重连为快照优先——整体替换，不做增量补发。

字段与消息契约：`core-types-and-events.md`、`protocol.md`；规则：`rules-junk.md`、`rules-bloodbattle.md`；取舍理由：`decisions.md`。
