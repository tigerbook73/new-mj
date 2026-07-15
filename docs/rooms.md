# 房间与连续对局模型（阶段 2）

> 状态：设计阶段，实现前规格定稿
> 决策依据：D11（房间跨连续 N 局，非一局即散）

## 1. 概述

房间（Room）对应一次会话（连续游戏），4 人各自累积分数；完成条件由 `sessionFormat` 决定（见 §2.1）；结束后房间进入 `finished` 状态，server 计算最终排名。

**MVP 实现**：`sessionFormat: "4-round"`（4 局固定）
**未来扩展**：`sessionFormat: "best-of-3"`（先赢 2 局）

## 2. 房间状态与生命周期

### 2.1 配置与字段设计（支持扩展）

```ts
type SessionFormat = "4-round" | "best-of-3"; // MVP: "4-round" only

type Room = {
  id: string;
  rulesetId: "junk" | "bloodbattle";
  config: GameConfig;
  sessionFormat: SessionFormat; // 决定结束条件

  phase: "waiting" | "in-game" | "finished"; // 简化（支持多种格式）
  status: "open" | "closed";
  players: [Player | null, Player | null, Player | null, Player | null];
  scores: [number, number, number, number]; // 累积分数

  // 多局追踪（支持扩展）
  gameNumber: number; // 当前游戏编号（1-based）
  totalGames?: number; // 4-round=4; best-of-3=null（动态）
  wins?: [number, number, number, number]; // 仅 best-of-3 使用（赢局数）

  dealer: SeatId; // 本局庄家座位
  gameState?: GameState; // 当前局的核心状态
  seed: number; // 当前局的随机种子（每局重新生成，便于调试/复现，不上线）
  lastEventSeq: number; // 当前局已发出事件的最大 seq（供 game:snapshot 携带）

  createdAt: number;
  finishedAt?: number;
  result?: SessionResult;
};

type Player = {
  userId: string;
  seatId: SeatId;
  nickname: string;
  isBot: boolean;
  isReady: boolean;
};

type SessionResult = {
  winner: SeatId;
  ranking: [{ seatId: SeatId; score: number }, ...];
  format: SessionFormat;
  gamesPlayed: number;
};
```

**`RoomInfo`（`packages/protocol/src/schemas.ts` 里的 `RoomInfoSchema`）** 是 `Room` 去掉 `gameState`/`seed`/`lastEventSeq` 之后的公开快照——这三个字段是 server 内部实现细节（当前局的核心状态、随机种子、事件序号），永远不上线，客户端只通过 `game:snapshot`（携带 `PlayerView`）拿到局内视图。

**设计要点（为 Best-of-3 扩展留路）**：

- ✅ `phase` 不硬编码 "round-1/2/3/4"，用 "in-game" 容纳任意局数
- ✅ `gameNumber` 明确当前是第几局（与格式解耦）
- ✅ `sessionFormat` 作为配置，决定终止条件
- ✅ `wins` 预留字段（4-round 不用，best-of-3 使用）
- ✅ `SessionResult.format` 记录最终格式，便于回放和统计

### 2.2 状态转移（格式无关）

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

## 3. 计分规则

### 3.1 逐局计分（格式独立）

每局结束时，core engine 返回 `{ state, events }`；server 从 `events` 中提取 `Settled` 事件，累加到 `room.scores[seatId]`。

示例（血战）：

- 玩家 A（座位 0）赢牌，获 8 倍分 → `scores[0] += 8`
- 玩家 B（座位 1）点炮，扣 8 倍分 → `scores[1] -= 8`

**原则**：

- 分数绝对值制（absolute），不做净额计算
- 每局完全结算，无"挂账"
- 4-round：仅分数决定排名
- best-of-3：分数作为辅助排序（赢局数优先）

### 3.2 最终排名（sessionFormat 感知）

```ts
// 4-round 模式
const ranking = scores
  .map((score, seatId) => ({ seatId, score }))
  .sort((a, b) => b.score - a.score);

// best-of-3 模式（未来）
const ranking = scores
  .map((score, seatId) => ({ seatId, score, wins: wins[seatId] }))
  .sort(
    (a, b) => b.wins - a.wins || b.score - a.score, // 先按赢局数，再按分数
  );
```

## 4. 庄家轮换

### 4.1 MVP（4-round）：简化轮转

每局顺时针轮转：

```ts
function nextDealer(currentDealer: SeatId): SeatId {
  return ((currentDealer + 1) % 4) as SeatId;
}
```

- Game 1：房主的座位为庄家
- Game 2-4：依次顺时针轮转

### 4.2 Future（best-of-3）：标准规则

赢家继续当庄，输家按顺序轮转（未来扩展实现）。

**扩展点**：在 `RoomService.computeNextDealer(sessionFormat, currentDealer, lastGameWinner)` 中根据 format 分支实现。

## 5. 协议扩展

### 5.1 新的 ack 请求

| 消息            | payload                   | data（成功时）     | 备注                                             |
| --------------- | ------------------------- | ------------------ | ------------------------------------------------ |
| `room:start`    | `{}`                      | `{ gameSnapshot }` | 房主发起，4 人到达后可调用；触发 game 1          |
| `room:nextGame` | `{}`                      | `{ gameSnapshot }` | 自动或房主触发进下一局（内部用）                 |
| `room:create`   | `{ sessionFormat?, ... }` | `RoomInfo`         | 创建时可指定 sessionFormat（MVP 默认 "4-round"） |

### 5.2 新的事件推送

| 消息                   | payload                                  | 说明                 |
| ---------------------- | ---------------------------------------- | -------------------- |
| `room:scoreUpdated`    | `{ scores, gameNumber, totalGames? }`    | 每局结束后 broadcast |
| `room:dealerChanged`   | `{ dealer: SeatId, gameNumber: number }` | 进下一局时           |
| `room:sessionFinished` | `{ result: SessionResult }`              | 会话结束，公开排名   |

## 7. 实现要点

### 7.1 Server 房间管理

```
apps/server/src/rooms/
  ├─ room.ts             // 内部 Room/RoomPlayer 状态类型
  ├─ room.service.ts     // 房间生命周期与编排
  ├─ room.events.ts      // EventBus 事件 payload 类型
  ├─ event-bus.ts        // 房间事件的类型化 EventEmitter 包装
  └─ room-service.error.ts // 携带 ErrCode 的异常类型，gateway 层负责映射成 ack 错误
```

（`RoomService.create` 实测落地时补了 `hostUserId`/`hostNickname` 参数——protocol.md 的"创建即入座"要求创建者立刻占座，光有 `rulesetId`/`config` 无法完成这件事；`sessionFormat` 有默认值 `"4-round"`，其余方法名与本节草图一致。）

- `RoomService.create(hostUserId, hostNickname, rulesetId, config, sessionFormat = "4-round")` → `Room`（创建即把 host 安排到座位 0）
- `RoomService.join(roomId, userId, nickname)` → `RoomPlayer` 加入某座位（`ALREADY_IN_ROOM`/`ROOM_FULL`/`ROOM_NOT_FOUND`）
- `RoomService.ready(roomId, userId, ready)` → 更新 ready 状态，广播 `room:readyChanged`
- `RoomService.start(roomId)` → 校验 4 人已就绪（`INVALID_CONFIG`）后触发第 1 局，`gameNumber` 从 0 变为 1
- `RoomService.nextRound(roomId)` → 轮转庄家、`gameNumber += 1`，内部由 `handleGameEnd` 触发，也可外部直接调用
- `RoomService.applyPlayerAction(roomId, seat, action)` → 代理 `GameService.applyAction`，累加 `Settled` 事件的比分，检测到 `GameEnded` 事件即触发 `handleGameEnd`（不读 `state.phase`，保持 server 不懂规则的边界）

### 7.2 Core 与 Room 的边界

- **Core** 的职责：`createGame` 生成初始 state；`applyAction` 驱动状态；`getPlayerView` 投影视图
- **Room** 的职责：管理跨局状态（scores、dealer、phase、players）；编排"局 → 局"的转移；调用 core 的接口

### 7.3 状态持久化

现阶段（MVP）可使用内存存储 `Map<roomId, Room>`；4 阶段落 PG 时改为数据库（见规划）。

## 8. 时序示意

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
  ← ack: { data: { gameSnapshot: PlayerView (round-1) } }
  ← room:phaseChanged { phase: "round-1", dealer: 0 }
  ← 所有人: game:snapshot { view: ..., seq: 0 }
  [进入正常对局，如 protocol.md §5 所述]
```

**第 1 局结束 → 第 2 局**

```
[局结束，core 返回 finished 状态]
  server: 从事件提取 scoreDeltas，更新 room.scores
  server: 计算 nextDealer = 1（轮转）

房间内所有人: room:scoreUpdated { scores: [...], roundNumber: 1 }
  (可选) room:dealerChanged { dealer: 1, roundNumber: 2 }
  room:phaseChanged { phase: "round-2" } 或直接下发 game:snapshot

所有人: game:snapshot { view: PlayerView (round-2), seq: 0 }
  [游戏自动开始或等待房主/所有人确认后开始]
```

**4 局全完**

```
[round-4 结束]
  server: 计算 ranking

房间内所有人: room:sessionFinished { result: { winner, ranking: [...] } }
  room:phaseChanged { phase: "finished" }
```

## 6. MVP 范围

**实现**（sessionFormat="4-round"）：

- ✅ 房间创建/加入/开始
- ✅ 4 人轮流对局，分数累加
- ✅ 简化庄家轮转（顺时针每局）
- ✅ 4 局完成后排名计算

**不实现**：

- ❌ Best-of-3 格式（保留配置结构和扩展点）
- ❌ 赢/输跟踪（4-round 不需要）
- ❌ 重连恢复（可降级为踢出 + 重新加入）
- ❌ 断线托管（评审点 H，后续优化）
- ❌ 中途替换玩家
- ❌ 再来一轮
- ❌ 观战、战绩（阶段 4）

## 7. 设计决策与扩展点

**既有决策**：

- **D11**：房间跨多局而非一局即散
- **D12 补充**：房间状态由 server Room 管理（与 gameState 分离）；gameState 由 core engine 管理
- **H**：对局中离座 = 转托管（现阶段不实现）

**为 Best-of-3 扩展留下的设计空间**：

- ✅ `sessionFormat` 配置字段：支持多种会话模式
- ✅ `gameNumber` + `totalGames?`：动态局数终止条件
- ✅ `wins?` 字段预留：best-of-3 需要跟踪赢局数
- ✅ `phase` 不硬编码 round-1/2/3/4：用 "in-game" 容纳任意局数
- ✅ `computeNextDealer(sessionFormat, ...)` 扩展点：支持不同的庄家轮换策略

**后续实现 best-of-3 时，仅需**：

1. 修改 `RoomService.shouldContinue()` 条件
2. 实现 `wins` 跟踪逻辑
3. 调整 `computeNextDealer()` 和 `computeRanking()` 的分支
4. 无需改动现有 4-round 的任何实现

---

**Next step**：protocol.ts 新增 RoomInfo/SessionResult 类型定义；server/session.ts 实现房间和转移逻辑。
