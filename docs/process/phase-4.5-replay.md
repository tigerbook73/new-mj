# 阶段 4.5：Replay / 明牌 Replay

> 过程性文档：本子阶段的详细实施计划，由 `plan.md`/`phase-4-junk-complete.md` 链接过来。收尾时把耐久内容按 `doc-map.md` §6 吸纳到对应文档，再删除本文件。
> 当前状态：盘点完成，最小记录形状已确定，子步骤 1（server 侧事件归档）、子步骤 2（protocol `replay:get` schema）已完成；子步骤 3-5 留待下一轮确认（照 4.4 拆成多个子步骤逐个做的先例）。

## 用户确认过的设计点

- **普通 replay 是正式产品功能**：局结束后，参与过这局的玩家可以回放这局（`phase-4-junk-complete.md` 原定目标），需要鉴权（请求者必须是当局某个座位的 userId）。
- **明牌 replay 仅调试/测试用**：跟直播版全明牌（D19）同一套门控——环境变量 `ALLOW_DEBUG_OMNISCIENT`，不进正式产品 UI，不是任何参与过该局的玩家都能看。

## 现状调研

1. **当前完全没有事件存储**：`RoomService.trackEventSeq`（`apps/server/src/rooms/room.service.ts:501`）只维护一个 `lastEventSeq` 计数器，事件广播后即丢弃；replay 需要从零建存储层。
2. **核心可复用能力已存在且已验证**：`rebuildPlayerView(events, seat)`（每个 ruleset 各自实现，如 `packages/core/src/rulesets/junk/view.ts:61`）接收未经视角过滤的完整事件数组，内部调用 `eventsVisibleTo` 做过滤，逐事件重建出该座位的 `PlayerView`；`packages/core/test/cross-ruleset-invariants.test.ts` 已验证"事件重建 ≡ 直接派生"在两个 ruleset、任意时刻都成立。也就是说 **replay 不需要 core 新增任何代码**，只要拿到完整事件数组喂给 `rebuildPlayerView` 即可，跟直播用的是同一套函数。
3. **可见性过滤对直播/回放一视同仁**：`eventsVisibleTo` 是纯函数、无状态，"刚发生的事件"和"历史存档的事件"处理方式完全一样——这也是全明牌调试功能（D19）的 `getOmniscientView` 能够直接被 replay 复用的原因，不需要区分"直播态"和"回放态"。
4. **局边界**：`beginGame()`（`room.service.ts:436`）重置 `lastEventSeq = 0`、切换 `phase = "in-game"`；局结束由 `runAction` 检测到某个事件 payload 满足 `isGameEndedPayload`（`room.service.ts:26`）后触发 `handleGameEnd()`（`room.service.ts:475`）。这两个方法之间的窗口就是"一局"的自然边界——事件日志应按**局**归档，不是整个房间会话一条流水账，跟 `phase-4-junk-complete.md` 里"打完一局后能重放这局"的表述一致。
5. **座位归属会随时间变化**：`RoomPlayer`（`room.ts`）只反映房间**当前**的座位占用；房间跨多局运行（D11），中途可能有人 `room:leave`/换座——所以"这局是谁在打"不能靠回放时去读 `room.players`（那是最新状态，不是当局快照），必须在存档时把"这局的座位→userId 映射"一起记下来，否则回放时无法判断请求者当时坐在哪个座位（或压根没参与过这局，从而拒绝非明牌请求）。
6. **core 事件本身不认识 userId**（架构铁律 3：SeatId 只是 0-3，`GameStarted` payload 目前只有 `handCounts`/`wallCount`/`dealer` 这类座位视角数据，没有 userId）——印证第 5 点：userId↔seat 映射必须由 server 在存档时单独挂上去，不能指望从事件流里反查。

## 最小记录形状

```ts
type GameReplayRecord = {
  roomId: string;
  gameNumber: number;
  // 该局开局时各座位的 userId 快照；bot 座位如何表示待实现时定
  seatUserIds: [string | null, string | null, string | null, string | null];
  // 未经视角过滤的完整事件数组，seq 从 1 开始，直接喂给 core 的 rebuildPlayerView
  events: readonly GameEvent[];
};
```

- **不存 `seed`**：回放走"事件重放"而非"重新跑 `applyAction`"，`seed` 只在生成事件时起作用，事件本身已是确定性历史的完整记录。`seed` 目前只在 fuzz 调试复现场景下才需要（`decisions.md` 已有的用法），跟这里面向用户的 replay 是两回事，不要混为一谈。
- **不需要额外的"起始状态快照"**：`rebuildPlayerView` 已把 `GameStarted`（seq=1）当作重建起点处理，只要事件数组从这条开始、完整无缺，就能重建任意时刻的 `PlayerView`。
- **明牌 replay 的衔接问题（留给子步骤规划）**：`getOmniscientView` 吃的是**状态**（`state.wall`/`state.seats[i].hand`），不是事件流；目前没有"从事件流重建完整 state（不只是某一视角的 PlayerView）"的通用函数。子步骤规划时需要决定：明牌 replay 是只支持"局终"（局终状态本来就还留着，不需要新函数）,还是要支持"回放到任意中间步骤都能看全知视角"（后者目前没有对应的 core 能力，超出这次盘点范围）。

## 子步骤路线

| 步骤 | 内容                                                                                                                                  | 状态 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1    | server：`Room` 加归档字段（`FinishedGameLog[]`），`beginGame` 记录 `seatUserIds` 快照，`runAction`/`handleGameEnd` 累积/归档 `events` | ✅   |
| 2    | protocol：新增查询式消息（如 `replay:get`），入参 `{roomId, gameNumber}`；鉴权校验请求者 `userId` 出现在该局的 `seatUserIds` 里       | ✅   |
| 3    | server gateway：新增 handler，复用 `rebuildPlayerView`（需要先在 server 侧接一层薄封装，类似 `GameService` 现在对四签名的封装）       |      |
| 4    | web：回放播放器（时间轴/单步前进，展示历史事件）                                                                                      |      |
| 5    | 明牌 replay：复用 `debug:omniscientView` 同一套环境变量门控；范围（局终 vs 任意步）待第 1-4 步落地后再定                              |      |

**步骤 1 实现记录**：`FinishedGameLog`（`apps/server/src/rooms/room.ts`）不带 `roomId`（记录已经挂在具体 `Room` 实例的 `finishedGames` 数组下，字段冗余）；`Room` 新增 `currentGameEvents`/`currentGameSeatUserIds`（进行中该局的累积区）与 `finishedGames`（归档数组）。`beginGame()` 用 `createGame` 自身返回的 `result.events` 播种 `currentGameEvents`（这批事件从不重播为 `game:event`，遗漏会导致 `rebuildPlayerView` 缺少 `GameStarted` 起点）并快照 `room.players` 的 userId；`runAction()` 每次 `applyAction` 后把新事件追加进 `currentGameEvents`；`handleGameEnd()` 在归零下一局前把当局完整记录 push 进 `finishedGames`。新增测试 `room.service.spec.ts`「RoomService — replay log archiving」验证 4 局会话产出 4 条记录，`seq` 从 1 连续、首事件是 `GameStarted`、`seatUserIds` 与实际入座一致。

**步骤 2 实现记录**：新文件 `packages/protocol/src/replay.ts`——`ReplayGetRequestSchema`（`{roomId, gameNumber}`）与 `ReplayGetResponseSchema`（`{gameNumber, finalView, events}`）。响应形状故意跟 `GameSnapshotSchema` 对齐（`finalView: PlayerViewBaseSchema` + `events: GameEventSchema[]`）——直播是"入座给一次全量快照 + 后续事件增量"，回放对应"进入回放给一次终局快照 + 完整事件时间轴供单步/拖动"，复用同一套心智模型，不发明新协议形状。`finalView`/`events` 复用 `game.ts` 现成的 schema，没有新增字段类型。协议层还不做鉴权（鉴权是 server 的事，见步骤 3），这一步只定数据形状。

## 状态

步骤 1（server 侧事件归档）、步骤 2（protocol `replay:get` schema）已完成并通过各自 `pnpm verify`。步骤 3-5 待下一轮确认后继续。
