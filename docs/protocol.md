# 协议消息清单（packages/protocol）

> 状态：v2，评审点 H/I 已定稿。全部消息以 zod schema 定义，三端共享（D10）
> 通道：除 OAuth（Supabase SDK）外全走 Socket.IO；client→server 一律 ack 请求-响应，server→client 一律单向事件推送

## 0. 握手

```ts
// 连接时 auth 载荷
{ token: string, protocolVersion: string, resume?: { roomId: string } }
```

- server 验证 JWT → 绑定 `socket.data.userId`；版本不匹配 → 拒绝连接并附 `VERSION_MISMATCH`（客户端提示刷新）
- `resume` 存在时：server 校验该用户确在该房间，成功则自动重新加入 socket room 并推送 `game:snapshot`（见 §3）

## 1. 统一信封

```ts
// ack 响应
type Reply<T> = { ok: true; data: T } | { ok: false; code: ErrCode; message?: string }
// 协议包提供封装：request(type, payload): Promise<T>（ok:false 时抛类型化错误）
```

**核心约定（ack 与事件的关系）**：

- **查询 = ack 给数据**：`lobby:list` 等，data 即答案，无后续事件；大厅列表为主动拉取（进大厅/下拉刷新），实时大厅推送留作将来增量
- **命令 = ack 给回执、事件给状态**：ack 仅表示受理/被拒；状态变更一律通过事件广播，**广播包含发起者本人**——所有客户端的状态更新只有"快照 + 事件流"一条路径，发起者不从 ack data 更新状态，客户端对自己触发的事件幂等应用
- **进入新上下文 = ack 给快照**：create/join 的发起者错过了历史事件，ack data 返回 RoomInfo 快照用于初始化（对局层对应 game:snapshot）

## 2. ack 请求类（client → server）

| 消息 | payload | data（成功时） | 主要错误码 |
|------|---------|---------------|-----------|
| `lobby:list` | `{}` | `RoomSummary[]`（id、玩法、人数、状态） | — |
| `room:create` | `{ rulesetId, config? }` | `RoomInfo` 快照（创建即入座） | `INVALID_CONFIG` |
| `room:join` | `{ roomId }` | `RoomInfo` 快照 | `ROOM_NOT_FOUND` `ROOM_FULL` `ALREADY_IN_ROOM` |
| `room:leave` | `{}` | `{}` | `NOT_IN_ROOM`（对局中允许离座：转托管，见评审点 H） |
| `room:ready` | `{ ready: boolean }` | `{}` | `NOT_IN_ROOM` |
| `room:addBot` | `{}` | `RoomInfo` | `ROOM_FULL`（仅房主，MVP 简化） |
| `game:action` | `{ action: Action }`（core 的 Action 原样透传） | `{}` | `NOT_YOUR_TURN` `ILLEGAL_ACTION`（附 core 的 RuleViolation code） |
| `profile:get` / `stats:get` | `{}` / `{ userId? }` | 资料 / 战绩 | 阶段 4 才实现，先占位 |

说明：

- 身份一律取 `socket.data.userId`，payload 不含也不信任 userId（D10 铁律）
- `game:action` 的 ack 仅表示"已受理/被拒"，实际结果通过事件流到达——客户端不得依据 ack 更新牌局状态

## 3. 事件推送类（server → client）

**房间事件（room:\*，public 于房间内）**

| 消息 | payload |
|------|---------|
| `room:playerJoined` / `room:playerLeft` | seat、昵称、是否 bot |
| `room:readyChanged` | seat、ready |
| `room:starting` | 倒计时或立即 |

**对局事件（对局中主通道）**

| 消息 | payload |
|------|---------|
| `game:event` | `{ event: GameEvent, deadline?: number }` —— core 事件原样转发（已按 visibility 过滤到本连接应见的版本），deadline 为 server 附加的表态/出牌截止时间戳（epoch ms），驱动客户端倒计时（D5） |
| `game:snapshot` | `{ view: PlayerView, seq: number, deadline?: number }` —— 入座开局时、断线重连时下发的权威快照 |

**评审点 I【已定：采纳快照优先】**：重连一律下发 `game:snapshot`，客户端弃旧状态整体替换。理由：实现最简、绝对一致（不依赖客户端旧状态正确）、代价仅是重连瞬间无增量动画。lastSeq 补发事件降级为将来的优化项。（规划文档 §1.2/§阶段4 已同步回写。）

## 4. 错误码（ErrCode）

```
UNAUTHORIZED  VERSION_MISMATCH
ROOM_NOT_FOUND  ROOM_FULL  ALREADY_IN_ROOM  NOT_IN_ROOM  GAME_IN_PROGRESS
NOT_YOUR_TURN  ILLEGAL_ACTION  INVALID_CONFIG
INTERNAL
```

- `ILLEGAL_ACTION` 的 `message` 附 core 返回的 RuleViolation code（如 `TILE_NOT_IN_HAND`、`CLAIM_NOT_AVAILABLE`），便于调试；客户端 UI 原则上不应触发它（合法动作由 myClaimOptions/getLegalActions 驱动渲染）

## 5. 时序示意

**入房（快照 + 广播含本人）**

```
B: room:join {roomId}
   ↓ server 校验 → socket.join(roomId)（先入组）
   ① ack → B: RoomInfo 快照（B 已在座）
   ② 广播 → 房间内所有人（含 B）: room:playerJoined {seat: 2, ...}
A、C：应用 ② 增量更新座位（被动事件通知，不拉取）
B：① 初始化状态；② 幂等 no-op（座位已占用）
```

**顺序保证（写入实现约定）**：

- 同连接消息有序（Socket.IO 单连接按发送序送达）；server 处理入房的固定顺序 = 入组 → 回 ack 快照 → 广播事件，保证发起者先有状态再收事件
- 每房间操作串行处理（§规划 2.2 口径），"生成快照 + 加入广播组"在处理内原子完成，快照之后无漏事件的缝隙——这是快照优先策略（评审点 I）成立的前提，重连同理

**一次出牌 → 碰**

```
A: game:action {discard 5m}  ──ack ok──
   ↓ server 跑 applyAction
所有人 ← game:event TileDiscarded(5m)
B、C ← game:event ClaimWindowOpened(各自选项, deadline=+5s)
B: game:action {peng}  ──ack ok──
C: （超时）server 代提交 pass
所有人 ← game:event ClaimWindowResolved / PengMade
B ← game:event TurnStarted(B)（B 碰后出牌）
```

**评审点 H【已定：采纳】**：`room:leave` 在对局中的语义 = 离座转托管，AI 代打到局终，不允许中途散局；掉线（disconnect）与主动离座走同一托管路径。（规划待办中"中途退出处理"已解决；房间是否连续多局仍留阶段 2 前决定。）
