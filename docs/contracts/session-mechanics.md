# 房间与连续对局：容器骨架

> 状态：迁移自 `_legacy/rooms.md`，已实现（`apps/server/src/rooms/`），4-round 会话验收通过
> 决策依据：`decisions.md` D11（房间跨连续 N 局，非一局即散）
> **本文件只讲容器骨架**：具体计分公式、庄家轮换公式、排名策略属于玩法规则，见 §4 的显式标注和各 `variants/*.md`。不讲 `apps/server` 的具体代码组织（见 `apps/server/AGENTS.md`）；不讲单局对局内部的规则细节（见 `variants/*.md`）。

## 1. 概述

**房间（Room）是一次连续对局会话的容器**：4 个玩家坐进一个房间后会连打一串局（局数由 `sessionFormat` 决定），每局结束累加分数，直到会话结束、算出最终排名。房间只是"局的容器"，不实现任何玩法规则。

## 2. 主要概念

- **`Room`**：server 持有的房间权威状态（`apps/server/src/rooms/room.ts`）。字段分两类：
  - 对外可见的房间信息：房间名称（`room:create` 时房主可指定，不填默认 `${昵称}'s room`，`lobby:list`/搜索用这个字段，不是 UUID）、玩法、座位、累积分数、当前第几局、庄家、会话状态等
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

| 消息          | 备注                                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room:start`  | 房主发起，4 人到达后可调用；触发 game 1；ack 只给回执，视图走 `game:snapshot` 事件单播                                                                                                                                  |
| `room:create` | 可指定 sessionFormat（MVP 默认 "4-round"）、房间名称（不填给默认值）；"进入新上下文"类消息，ack 给快照                                                                                                                  |
| `room:join`   | 可选 `seat`：给了必须是当前空座位（否则 `SEAT_TAKEN`），不给沿用"自动找第一个空位"；ack 给 `RoomInfo` 快照                                                                                                              |
| `room:ready`  | ack `{}`                                                                                                                                                                                                                |
| `room:addBot` | 仅房主（座位 0）、仅 `waiting` 阶段可调用；可选 `seat`（语义同 `room:join`），不给补入下一个空位；bot 立即视为已 ready；ack `{}`                                                                                        |
| `lobby:list`  | 查询，无副作用；`{ rulesetId, search? }` → `RoomSummary[]`，只返回 `phase==="waiting" && status==="open"` 的房间（MVP 不做观战/大厅列表实时推送，是一次性查询快照，search 按房间名称大小写不敏感子串匹配）              |
| `room:peek`   | 查询，无副作用，不占座；`{ roomId }` → `RoomInfo` 快照——房间页在玩家真正选座位前用它展示当前座位占用情况                                                                                                                |
| `room:leave`  | 无 payload，身份取自连接；`waiting` 阶段房主离开删整个房间（广播 `room:closed`），非房主离开只清空自己的座位（广播 `room:playerLeft`）；`in-game` 阶段立即转永久托管，不删房、不清座位；`finished` 阶段 no-op；ack `{}` |

`nextRound`（进下一局）是 `RoomService` 内部方法，**不是**对外暴露的 ack 消息，触发时机见下。

**局间确认（2026-07 新增）**：一局结束且 `shouldContinue(room)` 为真时，server 不再立刻自动开下一局——先把每个真人座位的 `isReady` 重置为 `false`（bot / 已永久托管座位立即自动置 `true`，不阻塞真人），广播对应的 `room:readyChanged`（复用既有消息，不新增协议面）。客户端此时从 `game:snapshot` 已经能看到 `view.phase==="finished"` 与 `view.result`（连同已经收到的 `room:scoreUpdated` 累计分数），据此渲染"上一局结果+下一局"确认界面；每个真人调用既有的 `room:ready { ready: true }` 确认继续。`RoomService.ready()` 每次调用后都会检查这个房间是否正处于"等下一局"状态且全部座位 `isReady` 均为 `true`，一旦满足就立刻触发 `nextRound`。若确认过程中某座位断线转永久托管，视同自动确认并重新检查。这套机制刻意不引入新的 room 级 `phase` 取值——"正在等下一局"是内部标志（`Room.awaitingNextRound`），从不上线；客户端完全靠 `view.phase`（本局是否已结束）+ `players[].isReady`（谁还没确认）自行判断展示状态。

**bot 自动出牌**：bot 座位没有对外暴露的"代打"消息——`RoomService` 在每次 `applyPlayerAction`（真人动作）之后、以及每局开局（`beginGame`）之后，都会扫描所有 `isBot` 座位，用 `@new-mj/ai` 的 `chooseAction(getLegalActions(state, seat))` 选一个动作并直接调用同一条内部执行路径，循环到没有 bot 座位还有合法动作为止（即轮到真人，或对局结束）。bot 拿到的是完整 `state`（同 server 自己的访问权限），不是 `PlayerView`——`decisions.md` D18 末尾提过的"AI 只吃 PlayerView"设想本轮不做，理由与技术债记录见 `decisions.md` D21。

**AI Advice 查询**：`game:advice {}` 不接受 seat/userId，gateway 只从握手连接定位座位。RoomService 对同一时刻的 `getPlayerView(state, seat)` 与 `getLegalActions(state, seat)` 调用 `packages/ai.recommendAction`，返回 `{seq, deadline?, actions, recommendedActionIndex?}`；查询不运行 `applyAction`、不创建或续期 timer、不发事件。recommendation 必须是 actions 的原对象，server 只返回其下标。Web 每次接受 snapshot 都清旧建议并增加本地 revision，只接受 seq/deadline/revision 全匹配的异步响应。

**声明窗口超时**：`ConfigService.claimTimeoutMs` 读取 `CLAIM_TIMEOUT_MS`，合法正整数原样采用（默认 `5000`，调试可设 `3600000` 等长值），缺失、空值、非有限数、小数、零或负数回退默认值。RoomService 不读取玩法私有 state，而是逐座位检查 `getLegalActions` 是否包含 `{type:"pass"}`；只有真人且未永久托管的合法 pass 座位才建立 timer。timer/deadline 属于 server 编排层，不进入 `Room`、core state 或 PlayerView。

同一声明窗口中已存在的座位 deadline 不因其他人响应而续期；每次动作后仅为新响应者建 timer，并清理已响应或已失去 pass 的座位。到期回调用 room+seat+deadline 校验自己仍是当前 timer，再通过同一 `runAction({type:"pass"})` 路径发布 events→snapshots 并触发 bot 后续。切局、终局、房间关闭和永久托管均清 timer；重连只返回既有 deadline，不重置时间。

**断线宽限期与永久托管（评审点 H 修订）**：`RoomsGateway.handleDisconnect` 在 socket 断开时查出该连接的 `{roomId, userId}`，交给 `RoomService.handleDisconnect`。若房间对局中，座位只标记 `isDisconnected = true` 并启动 server 独有的 60 秒定时器；宽限期内不设置 `isAutoPiloted`、不跑 bot，对局轮到该座位时保持等待。原 userId 在宽限期内通过 `room:enter` 重连时清除定时器、恢复真人控制，并在 ack 中携带该座位的 `{ view, seq }`。定时器到期后才置 `isAutoPiloted = true`、广播托管事件并补跑 bot。主动 `room:leave`/sign out 不经过宽限期，立即走永久托管路径。

**全部真人退出即关房**：`handleDisconnect` 和 `room:leave` 的 `in-game` 分支共享同一个私有方法（`RoomService.markAutoPiloted`）——标记完 `isAutoPiloted` 之后，如果房间里已经没有任何真人座位（每个座位要么本来就是 `isBot`，要么都被标了 `isAutoPiloted`），就不再调用 `autoPlayBots` 继续跑，直接把房间标 `phase: "finished"`/`status: "closed"`，广播 `room:closed { reason: "allPlayersLeft" }`——避免没有任何人观战的房间里 bot 互相打到底白白占用 server 资源。

**事件推送**（已实现）：

| 消息                      | payload                                  | 说明                                                 |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `room:playerJoined`       | seat、nickname、isBot                    |                                                      |
| `room:playerDisconnected` | seat                                     | 断线宽限期开始                                       |
| `room:playerReconnected`  | seat                                     | 宽限期内恢复真人控制                                 |
| `room:playerAutoPiloted`  | seat                                     | 到期或主动离开，永久转 AI 代打                       |
| `room:readyChanged`       | seat、ready                              |                                                      |
| `room:scoreUpdated`       | scores、gameNumber、totalGames?          | 每局结束后 broadcast                                 |
| `room:dealerChanged`      | dealer、gameNumber                       | 进下一局时                                           |
| `room:sessionFinished`    | result                                   | 会话结束，公开排名                                   |
| `room:playerLeft`         | seat                                     | `waiting` 阶段非房主主动离开                         |
| `room:closed`             | reason（`hostLeft` \| `allPlayersLeft`） | 房间不再存在：房主等待阶段离开，或对局中全部真人退出 |

**未实现**：`room:starting`。

## 7. 错误码（房间生命周期相关）

- `GAME_IN_PROGRESS`：对一个已经在对局中/已结束的房间发起 `room:start`
- `GAME_NOT_STARTED`：房间尚未进入 `in-game` 阶段时收到 `game:action`
- 这两个码语义相反，不要混用
- `SEAT_TAKEN`：`room:join`/`room:addBot` 指定了一个已经坐了人的座位；跟 `ROOM_FULL`（房间整体没位置，用于不指定座位的自动找位场景）语义不同，不要混用

## 8. 范围与设计决策

**MVP 实现**：

- ✅ 房间创建/加入/开始
- ✅ 4 人轮流对局，分数累加
- ✅ 简化庄家轮转（顺时针每局）
- ✅ 4 局完成后排名计算
- ✅ 断线托管（评审点 H，阶段 4.2）：对局中 socket 断开的座位自动标记 `isAutoPiloted`，复用阶段 4.1 的 `autoPlayBots` 继续代打到会话结束
- ✅ `room:leave`（阶段 4.4）：`waiting` 阶段主动离座/房主关房，`in-game` 阶段等同断线（同一套托管机制）；全部真人退出即自动关房，见 §6
- ✅ `lobby:list`/`room:peek`（阶段 4.4）：一次性查询快照，不做实时推送
- ✅ 房间名称（阶段 4.4）：`room:create` 可选 `name`，`room:join`/`room:addBot` 可选 `seat` 指定座位
- ✅ Replay（阶段 4.5）：每局归档事件日志 + 终局状态快照，参与过的玩家可回放；明牌 replay 走独立调试通道，见 §10
- ✅ 持久化（阶段 5）：事件日志/战绩落 PG，重启后 `replay:get` 仍可查；真正的 Supabase OAuth，见 §11
- ✅ 局间确认（2026-07 新增）：每局结束后不立刻自动开下一局，等所有真人座位复用 `room:ready` 确认后才 `nextRound`，见 §6

**MVP 不实现**：

- ❌ Best-of-3 格式（保留配置结构和扩展点，见下）
- ❌ 赢/输跟踪（4-round 不需要）
- ❌ 重连恢复（掉线/离座后的座位没有"恢复真人操控"路径，`isAutoPiloted` 永不清除；可降级为踢出 + 重新加入）
- ❌ 中途替换玩家、再来一轮
- ❌ 观战（根 `AGENTS.md` 不做清单，非某个具体阶段的"待做"，是长期不做）
- ❌ 战绩聚合查询接口（`stats:get`/`profile:get`，`contracts/protocol-shared.md` §4 仍是占位）：阶段 5 落地的是持久化层本身（schema + 写入 + `replay:get` 的 DB 兜底读取），不是一个新的聚合查询 API/UI，见 §11
- ❌ `lobby:list` 实时推送（仍是查询快照，不随他人建房/离开自动刷新）

**评审点 H【已定：采纳，2026-07 修订】**：对局中 socket 断开先进入 60 秒可逆宽限期，期间纯等待、不代打；同一 userId 通过 `room:enter` ack 恢复座位与快照。宽限期到期才永久转 AI 并补跑当前动作。主动 `room:leave`/sign out 立即永久托管。两态分别由 `isDisconnected` 与 `isAutoPiloted` 表示，`waiting` 阶段断线不处理。

**账号级并发连接约束（三态仲裁，2026-07 修订）**：server 维护 `SessionRegistry(userId -> { socket, tabId, browserId })`（`apps/server/src/gateway/session-registry.ts`）。`tabId`/`browserId` 是客户端握手时**必带**的身份信号（见 `protocol-shared.md` §1），server 按下述优先级确定性判断新连接跟已有连接的关系，不再靠"猜大概率是自己刷新前的旧连接"这类概率性推断：

1. **同一个 tab**（`tabId` 相同，典型是刷新）→ 无条件静默踢旧连接、接受新连接，第一次握手就成功，不看 `takeover` 字段——这吃掉了旧版"刷新时 race 到旧连接还没清理完"的问题，因为判断不再依赖"registry 里有没有残留项"这种时序敏感的信号，而是直接比对身份。
2. **同一个浏览器、不同 tab**（`browserId` 相同、`tabId` 不同）、且旧连接仍在 registry 里（即仍活跃）→ 无条件拒绝，握手以新错误码 `SESSION_EXISTS_SAME_BROWSER` 失败，`takeover:true` 在这条分支不起作用（没有接管入口）。客户端（无论是走 `ensureConnected()` 被动恢复还是 `LoginView`/`AuthCallbackView` 显式登录撞上这个码，见 §12）一律跳转独立的 `/session-blocked` 死路页（`apps/web/src/views/SessionBlockedView.tsx`）：只尝试 `window.close()`（对非脚本打开的普通 tab 是 best-effort，大概率静默失败），**不清任何本地凭证**——`localStorage` 里的 dev-session token / Supabase session 是同浏览器全部 tab 共享的，旧连接那个 tab 还在用同一份凭证，清掉会把它一起挤下线；即使这个死路页所在的 tab 被刷新，`tabId` 仍是同一个值（`sessionStorage` 语义），会再次确定性地撞回同一个错误码，不存在"死页面里刷新反而抢到会话"的风险。
3. **不同浏览器**（`browserId` 不同）→ 沿用旧版 `SESSION_EXISTS` 语义：默认拒绝；客户端确认接管后带 `takeover:true`，server 发送尽力而为的 `session:kicked` 并断开旧 socket，新连接再通过 `room:enter` 命中宽限期。**"确认接管"仅限有用户手势的显式登录路径**（`LoginView` 提交、OAuth 回调，`connectWithTakeoverPrompt`）——`App.tsx` 的整页加载会话恢复没有用户手势，理论上不会合法地撞上这条分支（本地能读到 token 就意味着这就是当年登录过的那个浏览器），万一出现就按"没有可用 token"处理，直接掉回未登录态，不弹确认、不静默接管。用户在 `confirm()` 里拒绝接管时，停留在原登录页面，内联提示改用其他账号登录（表单/OAuth 按钮继续可用），不跳转、不锁死。
4. **无冲突** → 现有流程，直接放行。

旧 socket 被踢后走普通断线路径，不触发主动离座托管；`registry.deleteIfSame` 摘除必须比较 socket 引用，避免旧连接延迟清理误删新登记。

**评审点 I【已定：采纳快照优先】**：开局及每个已接受动作都在该连接可见的 events 之后逐座位下发 `game:snapshot`，客户端不根据规则事件重建状态；重连由 `room:enter` ack 直接采用最新 `{view, seq}`，不重播历史动画。core `seq` 以单局为 epoch，切局后重新开始；客户端在同局丢弃更旧 seq，但允许相同 seq 的新快照覆盖（座位可见状态可能变化）。`lastSeq` 增量补发是未来可能的优化项，当前不实现。

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
每个座位: 先收到终局可见 game:event（view.result 已可读），再收到终局 game:snapshot

房间内所有人: room:scoreUpdated { scores, gameNumber: 1, totalGames: 4 }
server: 重置真人座位 isReady=false（bot/托管座位自动 true），设 room.awaitingNextRound=true
房间内所有人（真人座位重置那几条）: room:readyChanged { seat, ready: false } ×N
  [客户端展示"上一局结果 + 确认下一局"界面]

Player A/B/C/D: room:ready { ready: true }（各自确认）
  ← 各自 ack ok
  ← 房间内所有人: room:readyChanged { seat, ready: true } ×4
  [最后一个座位确认后，全部 isReady===true]

server: 计算 nextDealer = 1（轮转）并创建 game 2，room.awaitingNextRound=false
房间内所有人: room:dealerChanged { dealer: 1, gameNumber: 2 }
每个座位单独收到: game:snapshot { view: PlayerView(seat, game 2), seq, deadline? }
```

**4 局全完**

```
[第 4 局 applyPlayerAction 收到的 events 里出现 GameEnded，shouldContinue() 判 false]
  server: 计算 ranking

每个座位: 先收到终局可见 game:event，再收到终局 game:snapshot
房间内所有人: room:scoreUpdated { scores, gameNumber: 4, totalGames: 4 }
房间内所有人: room:sessionFinished { result: { winner, ranking, format, gamesPlayed: 4 } }
```

**离开房间**（阶段 4.4）

```
# waiting 阶段，非房主
Player B: room:leave {}
  ← ack: { ok: true, data: {} }
  ← 房间内其余人: room:playerLeft { seat: 1 }
  [座位 1 变回空位，房间照常存在]

# waiting 阶段，房主
Player A (房主): room:leave {}
  ← ack: { ok: true, data: {} }
  ← 房间内其余人: room:closed { reason: "hostLeft" }
  [房间被删除，room:peek/room:join 这个 roomId 之后都返回 ROOM_NOT_FOUND]

# in-game 阶段（等同断线，见 §6"断线托管"）
Player C: room:leave {}
  ← ack: { ok: true, data: {} }
  [座位 2 标记 isAutoPiloted=true，autoPlayBots 接管，房间继续跑；
   若这是房间里最后一个真人座位，改为广播 room:closed { reason: "allPlayersLeft" }]
```

## 10. 对局历史与回放（阶段 4.5）

- **归档时机**：每局结束（`RoomService.handleGameEnd`）时，把这局的完整信息存进 `Room.finishedGames: FinishedGameLog[]`——`{ gameNumber, seatUserIds, events, finalState }`：
  - `seatUserIds`：开局时的座位→userId 快照。跟 `room.players` 当前占用是两回事——房间跨多局运行，理论上中途座位会变化，一局自己的记录必须自包含，不能指望回放时去读"现在"的座位表。
  - `events`：未经视角过滤的完整事件数组，`seq` 从 1 开始（含 `createGame` 自身产生、从不重播为 `game:event` 的那批事件），直接喂 core 的 `rebuildPlayerView(rulesetId, events, seat)` 即可重建任意座位视角。
  - `finalState`：这局打完那一刻的 core 引擎状态——`handleGameEnd` 在下一局 `beginGame()` 覆盖 `room.gameState` 之前存的快照，只给调试用的明牌 replay 用（见下）。
- **`replay:get`**（查询，ack 给数据；正式产品功能，非调试专用）：请求 `{ roomId, gameNumber }`；鉴权只看请求者 `userId` 是否出现在该局的 `seatUserIds` 里——**不要求当前还在这个房间**（`seatUserIds` 是快照，已经离开房间的玩家仍能查自己参与过的对局，跟"当前房间连接注册表"完全脱钩，这点跟本文件其余 `room:*` 消息都要求当前在房间不同）。响应 `{ gameNumber, finalView, events }`：`finalView` 是该座位视角的终局 `PlayerView`，`events` 是 `eventsVisibleTo` 过滤后该座位可见的事件序列，供客户端单步/拖动播放——响应形状故意跟 `game:snapshot`（一次全量快照 + 后续事件增量）的心智模型对齐，不发明新协议形状。错误码：`gameNumber` 未归档 → `GAME_NOT_FOUND`；请求者不在 `seatUserIds` 里 → `UNAUTHORIZED`。
- **明牌 replay**（`debug:replayOmniscientView`）是调试/测试专用逃生舱，只支持局终（直接读 `finalState` 喂 `getOmniscientView`，不做事件重放），鉴权模型完全不同于 `replay:get`（要求当前是房间已入座玩家，跟直播版全明牌一致），不进正式产品 UI——完整说明见 `contracts/protocol-shared.md` §7、`decisions.md` D19。
- 事件日志/`finalState` 存内存的同时，`handleGameEnd`/会话结束也会 fire-and-forget 归档进 PG（阶段 5，见 §11）——内存副本仍是活跃房间期间的权威来源，`finished` 的房间对象不会被主动清理，一直留在内存里直到进程重启才整体清空（服务端目前没有任何房间过期/回收机制，是已知的 MVP 限制）；PG 副本是重启后 `replay:get` 兜底读取的来源，两者不是互斥关系。

## 11. 持久化（阶段 5）

- **三张表，Prisma 管理，无跨表外键**（`apps/server/prisma/schema.prisma`）：`profiles`（`id` = 真实 Supabase `auth.users.id`，`nickname`/`avatar`，只在真实 Supabase 登录成功后由 `auth.middleware.ts` upsert，dev 假登录不写这张表）、`room_sessions`（`id` = roomId，`rulesetId`/`sessionFormat`/`result: SessionResult`/`finishedAt`，会话结束时归档一行）、`game_logs`（`roomId`+`gameNumber` 复合唯一，`rulesetId`/`seatUserIds`/`events`/`finalState`，每局结束归档一行，跟 §10 的内存 `FinishedGameLog` 同形状 + 多一个 `rulesetId` 字段，让归档记录不依赖 `room_sessions` 行是否存在就能自解释）。三表互相之间、和 `auth.users` 之间都不建外键——`game_logs` 行必然先于对应 `room_sessions` 行写入（局结束 vs 会话结束不是同一时刻），硬 FK 会拒绝这些插入；`decisions.md` D7"单向引用 userId"的精神延伸到这里，一致性由应用层保证，不靠数据库约束。
- **写入路径 fire-and-forget**：`RoomService.handleGameEnd`（每局结束）和会话结束时分别调 `PersistenceService.archiveGame`/`archiveSession`，都不 `await`——失败只记日志，绝不能让"存历史记录"这件事有能力打断正在进行的对局逻辑（对局本身的正确性不依赖持久化是否成功）。`PersistenceService` 在 `DATABASE_URL` 未配置时每个方法直接短路成 no-op/`null`，不会让 Prisma 真的尝试连接。
- **读取路径**：`replay:get`/`debug:replayOmniscientView` 在内存里的 `room.finishedGames` 找不到对应局时（即该房间对象不在 `RoomService` 的内存 `Map` 里——按上面的说明，这只可能是"进程重启过"），退回查 `game_logs` 表；查到则照常走 `rebuildPlayerView`/`getOmniscientView` 重建返回值。`RoomService.getReplay`/`getReplayOmniscientView` 因此是 `async`，`RoomsGateway` 用只服务这两个 handler 的 `replyAsync`（其余 handler 保持同步 `reply()`，不受影响）。
- **鉴权**：`auth.middleware.ts` 按 `ConfigService.supabaseUrl`/`supabaseServiceKey` 是否配置分支——未配置就走 D16 的开发态共享 HS256 校验。配置了且 `ConfigService.isProduction` 为 false（`NODE_ENV !== "production"`）时，**先同步尝试同一份 D16 HS256 校验**（不等一次可能连不上本地 GoTrue 的网络往返）；不是有效 dev token 才用 `@supabase/supabase-js` 的 `auth.getUser(token)` 委托 Supabase 自己的服务器验证真实 token（`socket.data.userId` = Supabase 返回的 `user.id`，同时 fire-and-forget upsert 一行 `profiles`）；两者都失败才 `UNAUTHORIZED`。生产环境（`NODE_ENV=production`）完全跳过 D16 分支，只走真实 Supabase 校验（`decisions.md` D16/D28）——这是为了让 D23 提交进 git 的 Supabase CLI demo 配置不会挡住本地 `pnpm dev` 的假昵称登录，同时保证泄露的 dev secret 在生产环境完全没有可乘之机。两条主路径仍共用同一个中间件函数，靠配置存在与否分支，不是新增一个"测试模式"开关，现有全部 e2e（不设 `SUPABASE_URL`）零改动继续用旧路径。
- 完整取舍记录见 `decisions.md` D22。

## 12. 客户端会话恢复：server-truth 优先（`decisions.md` D28）

- **`playerRooms: Map<userId, roomId>`**（`RoomService`）：唯一的 userId→roomId 反查索引，只追踪真实玩家（bot 用合成 `bot:${uuid}` id，从不写入）。`findActiveRoomForUser(userId)` 是它唯一的读接口，供 `session:identity` 的 ack 消费（见 `protocol-shared.md` §1）。
  - 写入：座位真正入座时（`create`/`join` 内部的 `seatPlayer`）。
  - 清除：座位真正清空时——`leave()`/`removePlayer()` 的非托管分支、`closeAbandonedRoom()`（对局中最后一个真人离场）、一个 session（多局）整体结束（`handleGameEnd` 的 `!shouldContinue` 分支）。
  - **故意不清除**：座位被永久 auto-pilot 接管时（`markAutoPiloted`）。设计决策：用户仍应该能被带回这个房间围观，而不是断线/被 AI 接管之后就在 server 眼里"查无此房"——`TableView` 对这种"有座位、没有可恢复视角"的情况渲染只读的"已被 AI 接管"提示，见下。
- **client 端不再有单独的"恢复"状态机**：`apps/web/src/lib/sessionBootstrap.ts` 的 `ensureConnected()`/`doConnect()`/`establishSession()` 只负责"连上 socket + 拿身份 + 挂 `session:kicked`/`disconnect` 监听"，不做任何路由判断；`session:kicked`/`disconnect` 触发时只重置 store 状态（`socket:null` 等），不 `navigate()`、不整页刷新。
- **"该渲染什么/该在哪个 URL"统一收口到 react-router 的 `loader`**（`apps/web/src/router.tsx` 的 `protectedLoader`）：每个受保护路由（`/games`、`/lobby/:roomId`、`/room/:roomId`、`/replay/:roomId/:gameNumber`）的 loader 在组件挂载前跑，读 `session:identity` 给的 `activeRoomHint`（或已经 fetch 过的 `store.room`），跟当前路由的 `:roomId` 比对，不一致就 `redirect()`，从不出现"先渲染错的、再纠正"的一帧。`useRevalidator()`（`components/RevalidateOnSessionLoss.tsx`）把"没有发生导航但状态变了"（被踢/断线）接到同一套 loader 判断上——全应用只有 loader 这一处会为"状态不匹配"发起路由变化。
- **`room:enter` 的座位重绑定**：`RoomsGateway.handleRoomEnter` 现在会判断调用者是否能在 `room.players` 里定位到自己的座位——能定位到就调 `ConnectionRegistry.track()`（重新绑定该座位的 socket，修复重连后 `game:snapshot`/`game:event` 单播仍打到旧 socket 的问题），定位不到（纯预览/未入座）才退回 `enter()`。
- 服务器重启后，内存态房间本身就不存在了（架构未变，见 §11 开头），`playerRooms` 和"client 记住的 last-room"两种机制在这种情况下都救不回来——这是 server-truth 相对 client-only 机制严格更优、而非"各有取舍"的原因，见 `decisions.md` D28。
