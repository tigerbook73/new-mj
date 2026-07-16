# 核心数据模型（概念级）

> 叙事文档：讲清楚几个核心对象是什么、彼此什么关系。字段级精确定义不在本文——公共骨架见 `contracts/engine-contract.md`（GameState/PlayerView 的跨玩法公共部分）与 `contracts/session-mechanics.md`（Room/RoomInfo）；玩法私有字段见 `variants/*.md`。

## 1. 两个层次：Room 与 GameState

系统里有两个互不知情的层次，容易混淆，先厘清：

- **GameState**（`packages/core`）：只关心"当前这一局"。`createGame`/`applyAction` 不知道局与局之间的关系，甚至不知道"房间"这个概念存在。
- **Room**（`apps/server`）：管理"一串局"——分数怎么累加、庄家怎么轮换、下一局什么时候开始、整个会话什么时候结束。Room 每开一局调用一次 core 的 `createGame`，把返回的 state 存进自己的一个字段，除此之外不干涉 core 的任何内部逻辑（server 不实现麻将规则）。

这两层的边界就是"麻将规则 vs 房间编排"的边界，也是公共契约与玩法私有实现的主要分界线之一（另一条分界线在玩法之间，见 `variant-boundary.md`）。

## 2. 概念关系图

```
Room（连续对局会话容器，apps/server）
 ├─ Player × 4（座位、userId、是否 bot、是否 ready）
 ├─ scores[]（跨局累加，累加方式见玩法私有实现）
 ├─ gameNumber / sessionFormat（第几局、会话何时结束）
 └─ gameState: GameState（当前这一局，内容对 Room 不透明）
       ├─ 各玩法私有 State（JunkState / BloodbattleState ……，互不共享形状）
       ├─ 公共骨架字段（seat/hand 计数等，见 engine-contract.md 的 PlayerViewBase）
       └─ events: GameEvent[]（bring 状态变化，带 seq 与 visibility）
```

`RoomInfo` 是 `Room` 抹掉内部专用字段（`gameState`/`seed`/`lastEventSeq`）后发给客户端的公开快照，和 `SessionResult`（会话结束排名）一起是三端共享的协议类型——特意与内部 `Room` 分开维护，内部状态可以随便加字段，不用担心动到协议兼容性。

## 3. 状态即历史：为什么没有"数据库范式"式的关系模型

这不是一个传统 CRUD 应用，核心数据模型是"事件溯源"式的：一局的完整历史 = seed + 收到的 action 序列；任意时刻的状态都可以从头重放得到（见 `key-designs.md` §1、§4 的"事件重建 ≡ 直接派生"不变量）。持久化层（阶段 4，Supabase PG）计划落的是事件日志，不是当前状态快照的范式化表结构——这条设计选择直接决定了"核心数据模型"应该按事件流和状态机来理解，而不是按 ER 图来理解。

## 4. 每个玩法自己的状态形状

没有跨玩法共享的全局 `GameState`/`Action`/`Phase` 类型——每个 ruleset 在自己的模块里定义私有的 `<Id>State`/`<Id>Action`/`<Id>Phase`，公共骨架只提取真正跨玩法一致的最小交集（哪些字段、见 `engine-contract.md`）。这是有意的设计（`decisions.md` D12），不是尚未做的重构——具体原因见 `variant-boundary.md` 的判定准则。
