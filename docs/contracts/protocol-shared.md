# 通用协议契约

> 状态：迁移自 `_legacy/protocol.md`，v2，评审点 H/I 已定稿。全部消息以 zod schema 定义，三端共享（`decisions.md` D10）
> **只放跨玩法/跨房间通用的传输层约定**：房间/会话专属消息（room:\*）见 `session-mechanics.md`；某玩法的 `game:action` 具体 payload 见对应 `variants/*.md`。
> 通道：除 OAuth（Supabase SDK）外全走 Socket.IO；client→server 一律 ack 请求-响应，server→client 一律单向事件推送

## 1. 握手

```ts
// 连接时 auth 载荷
{ token: string, protocolVersion: string, tabId: string, browserId: string, takeover?: boolean }
```

- server 验证 JWT → 绑定 `socket.data.userId`；版本不匹配 → 拒绝连接并附 `VERSION_MISMATCH`（客户端提示刷新）；已实现见 `apps/server/src/gateway/auth.middleware.ts`
- 重连不使用握手 `resume` 字段；客户端恢复登录后调用 `room:enter`，由该消息 ack 携带必要的 `RoomInfo` 与（命中 60 秒宽限期时）`{ view, seq }` 快照。该 `roomId` 从何而来见下方 `session:identity`。
- **`session:identity`**（查询，握手成功后即可发）：`{}` → `{ userId, nickname, avatar?, activeRoom?: { roomId, phase } }`。`activeRoom` 是 server-truth 恢复依据（`RoomService.findActiveRoomForUser`，见 `session-mechanics.md` §12）——客户端不再靠自己记住的 `localStorage` roomId 猜测该恢复到哪，而是先查这个字段，非空时再对 `activeRoom.roomId` 发 `room:enter` 拿真正的快照；为空表示当前不在任何房间。
- `tabId`（客户端 `sessionStorage` 持久化，同 tab 刷新不变、新开 tab 换新值）/`browserId`（客户端 `localStorage` 持久化，同源全部 tab 共享）是账号级并发连接仲裁用的身份信号，握手**必带**，缺失/非字符串直接 `UNAUTHORIZED`；生成逻辑见 `apps/web/src/lib/clientIdentity.ts`。
- `takeover?: true` 仅用于"不同浏览器"这一种冲突（`browserId` 不匹配）下确认接管；`tabId` 相同（同一 tab 刷新）无条件静默接管，不看这个字段；`browserId` 相同但 `tabId` 不同（同浏览器另一个活跃 tab）无条件拒绝，这个字段也不起作用。完整仲裁逻辑与新增错误码 `SESSION_EXISTS_SAME_BROWSER` 见 `session-mechanics.md` "账号级并发连接约束"。

## 2. 统一信封与 ack/事件关系

`Reply<T>` 见 `packages/protocol/src/common.ts`；协议包提供封装：`request(type, payload): Promise<T>`（`ok:false` 时抛类型化错误）。

**核心约定**：

- **查询 = ack 给数据**：`lobby:list` 等，data 即答案，无后续事件
- **命令 = ack 给回执、事件给状态**：ack 仅表示受理/被拒；状态变更一律通过事件广播，**广播包含发起者本人**——所有客户端的状态更新只有"快照 + 事件流"一条路径，发起者不从 ack data 更新状态，客户端对自己触发的事件幂等应用
- **进入新上下文 = ack 给快照**：create/join 的发起者错过了历史事件，ack data 返回快照用于初始化

## 3. 对局内通用消息（game:\*，跨玩法共用信封）

| 消息            | payload                                                                                                                   | 说明                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `game:action`   | `GameActionRequestSchema`（action，core 按 rulesetId 判别的 Action 联合原样透传，具体 Action 形状见对应 `variants/*.md`） | ack `{}`；错误码 `NOT_YOUR_TURN` `ILLEGAL_ACTION`（附 core RuleViolation code）`GAME_NOT_STARTED`                       |
| `game:event`    | `{ event: GameEvent, deadline?: number }`                                                                                 | core 事件原样转发（已按 visibility 过滤到本连接应见的版本）；`deadline` **尚未实现**（超时代提交 pass 是 MVP 已知限制） |
| `game:snapshot` | `{ view: PlayerView, seq: number, deadline?: number }`                                                                    | 入座开局/切局时下发的权威快照；重连时由 `room:enter` ack 携带同形状的 `{ view, seq }`                                   |

身份一律取 `socket.data.userId`，payload 不含也不信任 userId（`decisions.md` D10 铁律）。`game:action` 的 ack 仅表示"已受理/被拒"，实际结果通过事件流到达——客户端不得依据 ack 更新牌局状态。

## 4. 未实现/占位（跨房间的通用能力）

`lobby:list` 已实现（阶段 4.4），具体 payload/data 形状（按 rulesetId + 房间名称搜索）见 `session-mechanics.md` §6，不在本节重复。

| 消息                        | payload              | data        | 说明                                                                                                                                                          |
| --------------------------- | -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile:get` / `stats:get` | `{}` / `{ userId? }` | 资料 / 战绩 | 阶段 5 落地的是持久化层本身（`profiles`/`game_logs`/`room_sessions` 表 + `replay:get` 的 DB 兜底），不是这层查询 API，仍是占位，见 `session-mechanics.md` §11 |

## 5. 错误码（ErrCode）通用部分

`ErrCode` 全集见 `packages/protocol/src/common.ts` 的 `ERROR_CODES`（权威来源，新增/删除错误码只改这一处，不要在文档手抄第二份列表）。

- `ILLEGAL_ACTION` 的 `message` 附 core 返回的 RuleViolation code（如 `TILE_NOT_IN_HAND`、`CLAIM_NOT_AVAILABLE`），便于调试；客户端 UI 原则上不应触发它（合法动作由 `myClaimOptions`/`getLegalActions` 驱动渲染）
- 房间生命周期相关的错误码（`GAME_IN_PROGRESS`/`GAME_NOT_STARTED` 等）见 `session-mechanics.md`

## 6. 时序示意：一次出牌 → 碰（跨玩法通用形状）

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

**顺序保证**：同连接消息有序（Socket.IO 单连接按发送序送达）；每房间操作串行处理，快照之后无漏事件的缝隙——这是重连"快照优先"策略（`contracts/session-mechanics.md` §8）成立的前提。

具体某个玩法的声明优先级顺序、Action 种类，见对应 `variants/*.md`。

## 7. 调试专用消息（dev-only，不属于正式产品面）

| 消息                         | payload          | data（`DebugOmniscientViewSchema`）     | 说明                                                                                                                                                                             |
| ---------------------------- | ---------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `debug:omniscientView`       | `{}`             | `{ wall: number[], hands: number[][] }` | 查询式 ack；返回原始 TileId，不做牌面渲染。仅用于本地调试/测试，不出现在任何正式产品 UI 入口。                                                                                   |
| `debug:replayOmniscientView` | `{ gameNumber }` | `{ wall: number[], hands: number[][] }` | 明牌 replay（阶段 4.5），只支持局终；`gameNumber` 指当前连接所在房间已归档的某一局，无 `roomId`（约定同 `debug:omniscientView`，不是 `replay:get` 那种"离开房间也能查"的模型）。 |

- 门控：server 侧 `ConfigService.allowDebugOmniscient`（读环境变量 `ALLOW_DEBUG_OMNISCIENT`，默认 `false`）关闭时一律拒绝，两条消息共用同一个开关。
- 鉴权/成员校验复用现有机制，不新增错误码：开关关闭或请求者不是该房间已入座玩家 → `UNAUTHORIZED`（座位未找到细化为 `NOT_IN_ROOM`）；游戏未开始 → `GAME_NOT_STARTED`；`debug:replayOmniscientView` 的 `gameNumber` 未归档 → `GAME_NOT_FOUND`。
- 故意绕开 core `getPlayerView` 的可见性过滤，直接读取隐藏手牌与未摸牌墙——这是显式受控的例外，不是"public 事件携带隐藏牌 id"（本消息不是 public 事件，是按需查询的单播 ack），不违反第 1 节以外的可见性铁律。取舍理由见 `decisions.md` D19，core 侧契约说明见 `engine-contract.md` §8。`debug:replayOmniscientView` 直接读取归档的 `finalState`（阶段 4.5，见 `session-mechanics.md` §10），不经过任何事件重放。
