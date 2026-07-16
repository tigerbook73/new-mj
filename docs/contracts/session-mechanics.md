# 房间与连续对局：容器骨架

> 状态：迁移自 `_legacy/rooms.md`，已实现（`apps/server/src/rooms/`），4-round 会话验收通过
> 决策依据：`decisions.md` D11（房间跨连续 N 局，非一局即散）
> **本文件只讲容器骨架**：具体计分公式、庄家轮换公式、排名策略属于玩法规则，见 §4 的显式标注和各 `variants/*.md`。不讲 `apps/server` 的具体代码组织（见 `apps/server/AGENTS.md`）；不讲单局对局内部的规则细节（见 `variants/*.md`）。

## 1. 概述

**房间（Room）是一次连续对局会话的容器**：4 个玩家坐进一个房间后会连打一串局（局数由 `sessionFormat` 决定），每局结束累加分数，直到会话结束、算出最终排名。房间只是"局的容器"，不实现任何玩法规则。

## 2. 主要概念

- **`Room`**：server 持有的房间权威状态（`apps/server/src/rooms/room.ts`）。字段分两类：
  - 对外可见的房间信息：玩法、座位、累积分数、当前第几局、庄家、会话状态等
  - 三个**永不上线**的内部字段：`gameState`（当前局的 core 引擎状态，规则细节只有 core 懂）、`seed`（当前局的随机种子，纯粹为了调试时能复现同一局）、`lastEventSeq`（当前局已发出事件的最大序号，下发 `game:snapshot` 时要带上）
- **`RoomInfo`**：发给客户端的公开快照，就是 `Room` 抹掉上述三个内部字段。跟 `SessionResult`（会话结束时的最终排名结果）一起定义在 `packages/protocol/src/schemas.ts`，是三端共享的协议类型——特意跟内部专用的 `Room` 分开维护，内部状态可以随便加字段，不用担心动到协议兼容性。
- **`SessionFormat`**：决定一次会话何时算结束。MVP 只用 `"4-round"`——固定打满 4 局才结束；预留了 `"best-of-3"`（先赢 2 局即结束）作为未来扩展位，本阶段不实现。
- **`Player`**：某个座位上的玩家信息（userId、昵称、是否 bot、是否已 ready）。
- Room 与 core 的 `GameState` 是两个层次（详见 `architecture/data-model.md`）：Room 每开一局调用一次 core 的 `createGame`，把返回的 state 存进 `Room.gameState`，除此之外不干涉 core 的任何内部逻辑。

## 3. 生命周期与状态转移

房间从创建到结束只有三个阶段，跟 `sessionFormat` 取值无关：

```
[创建]
  ↓
waiting: 等待 4 人加入并全部 ready
  ↓ （4 人到达 + 房主开始）
in-game (game 1): 第 1 局对局中（dealer = 房主）
  ↓ （局结束，检查是否还继续）
  ├─ 若 sessionFormat="4-round" && gameNumber < 4 → in-game (game 2)
  ├─ 若 sessionFormat="best-of-3" && wins[X] < 2 → in-game (game 2 or 3)
  └─ 否则 → finished
finished: 计算排名，对外公开 result
```

`phase` 只有一个进行中状态 "in-game"，不写死成 "round-1"/"round-2"，具体第几局靠 `gameNumber` 单独跟踪——这样以后加 best-of-3 不用改状态机形状，只用改"继续还是结束"那一条判断。

## 4. 计分与排名——⚠️ 现状是共享实现，不是确认的公共契约

**这一节的内容目前是两个玩法共用的同一份代码，但这只是巧合，不是设计结论**——详见 `architecture/variant-boundary.md` 的边界台账。新增一个计分/排名逻辑明显不同的玩法（如引入 uma/oka 名次奖惩分的日麻）时，预期需要把这里拆成 per-ruleset dispatch，而不是在 `RoomService` 里加分支。

每局结束时，core engine 返回 `{ state, events }`；server 从 `events` 中提取 `Settled` 事件，累加到 `room.scores[seatId]`——**具体 `Settled` 事件的分数怎么算出来，是玩法私有的**，见对应 `variants/*.md`。

当前的房间层原则（现状实现，非公共契约）：

- 分数绝对值制（absolute），不做净额计算
- 每局完全结算，无"挂账"
- 4-round：仅分数决定排名，按分数从高到低排出名次，没有其他 tie-breaker（已实现：`RoomService.computeRanking`）
- best-of-3（**未实现**，设计草图）：分数作为辅助排序，赢局数优先

## 5. 庄家轮换——容器侧的编排

谁来决定下一局的庄家分两种情况：

- **Game 1**：房主的座位为庄家——纯房间/座位安排（房主总是第一个入座 = 座位 0），与麻将规则无关，`RoomService.create()` 直接写死，不经过 core。
- **Game 2 起**：庄家轮换**公式**属于麻将规则本身，归属 `packages/core`，容器侧只调用 `contracts/engine-contract.md` §4 定义的 `RulesetModule.computeNextDealer(finishedState, currentDealer)`、存结果、广播 `room:dealerChanged`，不实现任何轮换公式。当前两个玩法的具体公式见各自 `variants/*.md`。

## 6. 房间专属协议消息

**ack 请求**（已实现，详细 payload 见 `contracts/protocol-shared.md` 的通用信封约定）：

| 消息 | 备注 |
|---|---|
| `room:start` | 房主发起，4 人到达后可调用；触发 game 1；ack 只给回执，视图走 `game:snapshot` 事件单播 |
| `room:create` | 可指定 sessionFormat（MVP 默认 "4-round"）；"进入新上下文"类消息，ack 给快照 |
| `room:join` | ack 给 `RoomInfo` 快照 |
| `room:ready` | ack `{}` |

**未实现/占位**：

| 消息 | 说明 |
|---|---|
| `room:leave` | 对局中允许离座：转托管（见 §7 评审点 H），**尚未实现** |
| `room:addBot` | 仅房主，MVP 简化，**尚未实现** |

`nextRound`（进下一局）是 `RoomService` 内部方法，由局结束后自动触发，**不是**对外暴露的 ack 消息。

**事件推送**（已实现）：

| 消息 | payload | 说明 |
|---|---|---|
| `room:playerJoined` | seat、nickname、isBot | |
| `room:readyChanged` | seat、ready | |
| `room:scoreUpdated` | scores、gameNumber、totalGames? | 每局结束后 broadcast |
| `room:dealerChanged` | dealer、gameNumber | 进下一局时 |
| `room:sessionFinished` | result | 会话结束，公开排名 |

**未实现**：`room:playerLeft`、`room:starting`。

## 7. 错误码（房间生命周期相关）

- `GAME_IN_PROGRESS`：对一个已经在对局中/已结束的房间发起 `room:start`
- `GAME_NOT_STARTED`：房间尚未进入 `in-game` 阶段时收到 `game:action`
- 这两个码语义相反，不要混用

## 8. 范围与设计决策

**MVP 实现**：

- ✅ 房间创建/加入/开始
- ✅ 4 人轮流对局，分数累加
- ✅ 简化庄家轮转（顺时针每局）
- ✅ 4 局完成后排名计算

**MVP 不实现**：

- ❌ Best-of-3 格式（保留配置结构和扩展点，见下）
- ❌ 赢/输跟踪（4-round 不需要）
- ❌ 重连恢复（可降级为踢出 + 重新加入）
- ❌ 断线托管（评审点 H，后续优化）
- ❌ 中途替换玩家、再来一轮
- ❌ 观战、战绩（阶段 4）

**评审点 H【已定：采纳】**：对局中退出 = 转托管代打到局终，掉线与主动离座同路径，不允许中途散局；`room:leave` 转托管本身尚未实现。

**评审点 I【已定：采纳快照优先】**：重连一律下发 `game:snapshot`，客户端弃旧状态整体替换；`lastSeq` 增量补发是未来可能的优化项，当前不实现。

**为 Best-of-3 预留的设计空间**：`sessionFormat` 配置字段、`gameNumber`/`totalGames?` 局数追踪、`wins?` 字段、不写死的 `phase`——真要实现 best-of-3 时只需要修改 `RoomService.shouldContinue()` 的判断条件、实现 `wins` 跟踪、调整 `computeRanking()` 分支；若"赢家继续当庄"也要落地，改对应 ruleset 的 `computeNextDealer`。不需要改动现有 4-round 的任何实现。

相关决策：D11（房间跨多局而非一局即散）、D12 补充（房间状态由 server `Room` 管理，与 `gameState` 分离）、D15（庄家轮换归属 core）——详见 `decisions.md`。

## 9. 时序示意

**创建房间 + 开始第 1 局**

```
Player A (room主): room:create { rulesetId: "bloodbattle" }
  ← ack: { data: RoomInfo 快照 (phase=waiting, scores=[0,0,0,0]) }

Player A、B、C、D: room:join { roomId }
  ← 各自收到 ack: { data: RoomInfo 快照 (含 4 人列表) }
  ← 房间内所有人: room:playerJoined { seat: ..., nickname: ... }

Player A/B/C/D: room:ready { ready: true }
  ← 各自 ack ok
  ← 房间内所有人: room:readyChanged { seat, ready: true } ×4

Player A (房主): room:start {}
  ← ack: { ok: true }（回执，不带视图）
  ← 每个座位单独收到: game:snapshot { view: PlayerView(seat), seq, deadline? }
  [进入正常对局]
```

**第 1 局结束 → 第 2 局**

```
[applyPlayerAction 收到的 events 里出现 GameEnded]
  server: 从 Settled 事件提取 scoreDeltas，更新 room.scores
  server: 计算 nextDealer = 1（轮转）

房间内所有人: room:scoreUpdated { scores, gameNumber: 1, totalGames: 4 }
房间内所有人: room:dealerChanged { dealer: 1, gameNumber: 2 }
每个座位单独收到: game:snapshot { view: PlayerView(seat, game 2), seq, deadline? }
```

**4 局全完**

```
[第 4 局 applyPlayerAction 收到的 events 里出现 GameEnded，shouldContinue() 判 false]
  server: 计算 ranking

房间内所有人: room:sessionFinished { result: { winner, ranking, format, gamesPlayed: 4 } }
```
