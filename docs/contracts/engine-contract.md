# core 引擎公共契约（engine-api）

> 状态：v3 迁移自 `_legacy/core-types-and-events.md`，阶段 1/1.5 已实现并测试通过（`packages/core`）；取舍理由见 `decisions.md`（评审点 A–G、D12、D15）
> **只放跨玩法真正共用的契约**：具体某个玩法怎么实现，见对应 `variants/*.md`。凡是本文件之外的类型/事件/字段，一律是玩法私有的。
> 原则回顾：applyAction 对外纯函数；时间不进 core；事件带可见性（D4/D5）

## 1. 基础类型

- `TileKind`/`TileId`/`SeatId` 见 `packages/core/src/lib/ids.ts`；`MeldType`/`Meld` 见 `packages/core/src/lib/seat.ts`
- 牌面记法：`m/p/s/z` 分别对应万/筒/条/字牌（东南西北白发中）
- `SeatId` 只是 0-3，core 不认识用户，userId ↔ SeatId 映射由 server 维护
- 状态与事件存 `TileId`；规则逻辑（胡牌判定、碰杠匹配）经 `kindOf(id)` 按种类运算（取舍理由见 `decisions.md` 评审点 A）

**安全纪律**（跨所有玩法一致，任何新玩法必须遵守）：id→kind 映射静态公开，因此 TileId 与牌面同级敏感。

- 不得在 public 事件中暴露仍处于隐藏状态的牌的 id（如手牌、暗杠）
- 已公开的牌（出牌、副露中的牌、胡牌快照）可在 public 事件中包含 id，支持 UI 精准动画

**测试约定**：fixture 用例以 kind 书写（如 `[1m,2m,3m]`），由加载器自动派发 id；细节见 `testing-strategy.md`。

## 2. engine-api 公共骨架（`packages/core/src/types.ts`）

只保留跨玩法共用的形状，不包含任何一个玩法的具体状态：

- `GameConfig`：`{ rulesetId, ...变体 config }`
- `RuleViolation`
- `PlayerViewBase`（见 §5）
- `ApplyResult<TState>`：`{ state: TState; events: GameEvent[] } | { error: RuleViolation }`

每个 ruleset 在 `rulesets/<id>/types.ts` 定义自己完整的 `<Id>State`，没有跨玩法共享的全局 `GameState`（`decisions.md` D12）；公共子结构 `SeatState`/`Meld`/`DiscardEntry` 来自 `lib/seat.ts`，玩法都可以用，但玩法私有状态形状互不相同。

## 3. 四签名（唯一冻结契约）

`createGame` / `applyAction` / `getLegalActions` / `getPlayerView`——本身不理解任何玩法，签名对外承诺见下：

- `applyAction(state, seat, action)`：非法即返回 `RuleViolation`（含机器可读 code），state 不变；server 超时代提交的 `pass` 与玩家主动 `pass` 完全同型（`decisions.md` D5）
- `getPlayerView(state, seat)`：引擎按 `state.config.rulesetId` 分发到具体 ruleset，返回值收窄为 `PlayerViewBase`；调用方若需要玩法私有字段，用具体 ruleset 的 `getPlayerView` 或做类型收窄

## 4. `RulesetModule` 的扩展点（跨局 dispatch + 事件重建）

除了单局内的四签名，`RulesetModule` 还承担其他 dispatch 职责——**这里只列契约签名，具体公式/解释逻辑属于玩法私有，见各 `variants/*.md`**：

- `computeNextDealer(finishedState, currentDealer) → SeatId`（跨局）：给定上一局怎么打完的，下一局谁坐庄。`finishedState` 就是刚打完那局的最终状态，不是新发明的类型。第 1 局的庄家（房主座位）不经过这个方法，由房间层直接决定，见 `session-mechanics.md`。
- 会话排名策略（跨局）：**当前尚未拆成 dispatch 方法**，现状是房间层（`RoomService.computeRanking`）直接实现，两个玩法共用同一份代码——这是待验证的私有决策，不是确认的公共契约，见 `architecture/variant-boundary.md`。新增玩法如果排名逻辑与现状不同，这里预期会新增一个 dispatch 方法（可能命名为 `computeRanking`），而不是分支硬编码进房间层。
- `rebuildPlayerView(events, seat) → TView`（局内，非跨局）：不经过实时 `state`，直接从一段历史事件流重建某座位的 view——跟 `getPlayerView` 是同一个不变量的两种入口（`decisions.md` "事件重建 ≡ 直接派生"），区别只是数据来源是存量事件而非当前 state。事件 payload 的解释逻辑是玩法私有的，所以（跟 `computeNextDealer` 同理）必须走 dispatch，不能像 `getOmniscientView`（D19，§8）那样做成跨玩法通用的结构化纯函数。`packages/core/src/engine.ts` 导出的顶层 `rebuildPlayerView(rulesetId, events, seat)` 按 `rulesetId` 显式 dispatch（没有 `state` 可读，不能像其余函数那样从 `state.config.rulesetId` 取）。供 `docs/process/phase-4.5-replay.md` 使用。

新增玩法时，只需要在自己的 ruleset 里实现这些方法（哪怕实现内容和别的玩法一样也要各自写一份，见 `architecture/variant-boundary.md`），不动 `RoomService`/`RoomsGateway` 等编排代码。

## 5. PlayerView 公共骨架

`PlayerViewBase`（`packages/core/src/types.ts`）只含跨玩法一致的字段：`seat`/`hand`/`seats[].handCount`/`wallCount`/`currentSeat`，无时间字段（倒计时 deadline 由 server 在协议层附加，`decisions.md` D5）。

玩法私有字段不放进公共骨架，各 ruleset 用交叉类型扩展（`phase`/`myClaimOptions`/`lastDiscard`/`result`、公开副露与牌河的具体表示等）；不同玩法甚至可以选择不同的敏感度表示方式（如 TileId vs TileKind），这是契约允许的自由度，具体选择见各 `variants/*.md`。

## 6. 事件信封（公共部分）

信封结构（`GameEvent`/`EventVisibility`/`EVENT_TYPES` 常量）见 `packages/core/src/events.ts`——这是跨玩法共用的壳（seq、visibility 字段与语义），具体每个玩法有哪些事件、payload 长什么样，一律在各 `variants/*.md` 的事件清单里，不在本文件重复。

非法动作不进事件日志（不改变状态），仅作为 `applyAction` 的错误返回：server 以 ack 拒绝该客户端，并记入 server 侧错误日志（取舍理由见 `decisions.md` 评审点 D）。

## 7. 核心不变量（跨玩法测试基石）

- **容器唯一性**：任一 TileId 任意时刻物理上只归属一个容器——牌墙 / 某家手牌 / 某家牌河活跃条目 / 某家副露 / 胡牌快照。牌集守恒 = 上述容器的 TileId 并集恒等于完整牌集且两两不相交。
- **事件重建 ≡ 直接派生**（`decisions.md` 评审点 G）：任意时刻，事件流重建的视图必须等于直接调用 `getPlayerView` 的结果。测试参数化遍历已注册的 ruleset（`packages/core/test/cross-ruleset-invariants.test.ts`），新增玩法只需要把自己的 ruleset 加进注册表，不必重写测试——测试策略见 `testing-strategy.md`。

这两条不变量本身是公共契约的一部分：任何新玩法都必须满足，不因玩法而异。

## 8. 调试/测试专用逃生舱（不属于本契约）

`packages/core/src/lib/omniscient.ts` 的 `getOmniscientView(state)` **不是**第 3 节四签名的一部分，也不是第 4 节 `RulesetModule` 的 dispatch 方法——它是一个跨玩法通用的结构化纯函数（对 `{ wall, seats }` 形状的泛型约束，做法与 `lib/invariants.ts` 的 `assertContainerUniqueness` 相同），故意暴露隐藏手牌与未摸牌墙的 TileId，仅供 server 侧的调试/测试通道使用（取舍理由见 `decisions.md` D19）。新增玩法若破坏 `{ wall, seats }` 这个结构假设，该函数会编译失败，与 `assertContainerUniqueness` 承担的是同一类技术债，不是本契约新增的风险面。
