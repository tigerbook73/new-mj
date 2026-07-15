# core 类型与事件清单

> 状态：v3，阶段 1 已实现并测试通过（`packages/core`）；取舍理由见 `decisions.md`（评审点 A–G）
> 原则回顾：applyAction 对外纯函数；时间不进 core；事件带可见性（D4/D5）

## 1. 基础类型

```ts
// 牌的种类：字符串字面量，采用 m/p/s/z 记法
// '1m'–'9m' 万 | '1p'–'9p' 筒 | '1s'–'9s' 条
// '1z'东 '2z'南 '3z'西 '4z'北 '5z'白 '6z'发 '7z'中
type TileKind = string; // 用模板字面量类型收紧

// 牌的实例：每张物理牌有唯一 id（0..N-1，N 由 RuleSet 牌集决定）
// id → kind 为静态表，由 RuleSet 牌集按规范顺序派生：kindOf(id): TileKind
type TileId = number;

// 座位：core 只认识座位，不认识用户
// userId ↔ SeatId 的映射由 server 维护（AI 与真人在 core 层无差别）
type SeatId = 0 | 1 | 2 | 3;

type MeldType = "chi" | "peng" | "minGang" | "anGang" | "buGang";
type Meld = { type: MeldType; tiles: TileId[]; from?: SeatId };
```

状态与事件存 `TileId`；规则逻辑（胡牌判定、碰杠匹配）经 `kindOf(id)` 按种类运算（取舍理由见 decisions.md 评审点 A）。
**配套纪律（安全）**：id→kind 映射静态公开，因此**暴露 id 等于暴露牌面**——一切可见性过滤须将 id 与 kind 视为同级敏感（TileDrawn/暗杠的 public 版本均不得携带 id）。
**配套约定（测试）**：fixture 中用例仍以 kind 书写（如 `[1m,2m,3m]`），由加载器自动派发 id。

## 2. 状态形状（按 ruleset 私有）

D12 之后不存在全局 `GameState`：每个 ruleset 在 `rulesets/<id>/types.ts` 定义自己的 `<Id>State`（`JunkState`、`BloodbattleState`……），公共子结构（`SeatState`/`Meld`/`DiscardEntry`，见 §1）来自 `lib/seat.ts`。以 junk 为例：

```ts
type JunkState = {
  config: JunkConfig; // { rulesetId: "junk", ...地方细则 }，随对局持久化
  phase: JunkPhase; // 见 §3
  wall: TileId[]; // 剩余牌墙（头部摸牌、尾部杠补）
  seats: SeatState[]; // 长度 4
  currentSeat: SeatId;
  lastDiscard?: { seat: SeatId; tile: TileId };
  pendingClaims?: JunkPendingClaims; // 声明窗口期间存在
  seq: number; // 已发出事件的最大序号
  prng: PrngState; // 可序列化的 PRNG 状态（seed 派生，定义于 lib/prng.ts）
  result?: JunkGameResult; // 终局后填充
};

type JunkPendingClaims = {
  discard: { seat: SeatId; tile: TileId };
  source?: "discard" | "robKong"; // 缺省/`discard` 为普通弃牌；`robKong` 为补杠第四张
  options: Partial<Record<SeatId, JunkClaimOption[]>>; // 仅含有权响应的座位
  responses: Partial<Record<SeatId, JunkAction>>;
};
```

`variantState` 命名空间（D6）已被 D12 撤销：规则状态本身就是完整状态。血战原来塞进 `variantState.exchange`/`variantState.lack` 的换三张/定缺私有字段，现在是 `BloodbattleState` 顶层的 `exchange?`/`lack?` 可选字段，不再需要一层命名空间去隔离。

engine-api 的公共骨架（`types.ts`）只保留跨玩法共用的形状：`GameConfig`（`{ rulesetId, ...变体 config }`）、`RuleViolation`、`PlayerViewBase`（见 §6）、`ApplyResult<TState>`（即 `{ state: TState; events: GameEvent[] } | { error: RuleViolation }`，替代旧版按玩法各自散落的"apply 结果"形状）。

`source='robKong'` 仅在 junk config 的 `robKong=true` 时出现：补杠第四张在声明窗口结束前仍留在补杠者手牌，不创建牌河条目；只有全员 pass 后才转入 `buGang` 副露并尾部补摸。若有人胡，该牌仍归补杠者手牌，胡牌事件亮出它但不制造容器重复。

**容器唯一性约定**：任一 TileId 任意时刻**物理上**只归属一个容器——牌墙 / 某家手牌 / 某家牌河**活跃条目**（claimedBy 为空）/ 某家副露 / 胡牌快照。牌打出即入出牌者牌河；被吃/碰/杠时，牌的物理归属移入声明者副露（Meld.from 记录来源家），牌河条目原位保留并置 claimedBy（墓碑，不计入守恒）。"牌集守恒"不变量 = 上述容器的 TileId 并集恒等于完整牌集且两两不相交；附加不变量：每个墓碑条目的 TileId 必出现在 claimedBy 家的某个副露中。

`pendingClaims.options` 只包含**至少有一个合法响应**的座位；无选项的家不进窗口、无需表态，server 的超时计时也只针对这些座位（取舍理由见 decisions.md 评审点 B；已知泄漏见评审点 E）。

## 3. Phase（各 ruleset 私有类型，取值恰好有重叠）

`JunkPhase` 与 `BloodbattlePhase` 是两个独立声明的类型，不是同一个 `Phase` 的子集——两个玩法的状态机形状不同，只是碰巧共用了几个阶段名字。

`JunkPhase`：`dealing → playing ⇄ awaiting-claims → finished`

- `dealing`：发牌（引擎内部瞬时完成，产出发牌事件后进入 playing）
- `playing`：当前家行动（打牌/暗杠/补杠/自摸）；血战另含直杠、抢杠胡与流局结算
- `awaiting-claims`：声明窗口（见规则文档）
- `finished`：有人胡或流局

`BloodbattlePhase`：`exchanging → choosing-lack → playing ⇄ awaiting-claims → finished`（`exchangeThree=false` 时跳过 `exchanging`）。`exchanging` 与 `choosing-lack` 都是四家独立提交、全员提交后自动转移的阶段；playing 已实现缺门出牌、碰/胡声明、多赢家、杠、抢杠胡、呼叫转移、三家胡/牌墙耗尽与流局终局结算。

摸牌为引擎自动转移，不是玩家 Action，杠后补摸同理：上一动作的裁决结果若为"轮到某家摸牌"，引擎在同一次 `applyAction` 内自动完成摸牌、发出 TileDrawn 事件并进入该家的 playing（取舍理由见 decisions.md 评审点 C）。摸牌均有事件（#4/#12，双版本），客户端据此渲染摸牌动画：他家播牌背飞入，自己播牌面飞入。

## 4. Action（按 rulesetId 判别，各玩法私有联合）

D12 之后不存在全局 `Action`：`engine-api` 的 `applyAction` 签名对外只承诺"入参是某个已注册 ruleset 私有的 Action 类型"，具体判别联合由各玩法在自己的 `types.ts` 定义。junk 的 `JunkAction`：

```ts
type JunkAction =
  | { type: "discard"; tile: TileId }
  | { type: "anGang"; kind: TileKind } // 自己回合（四张同种，按种类指定）
  | { type: "buGang"; tile: TileId } // 自己回合
  | { type: "zimo" } // 自己回合自摸胡
  | { type: "chi"; tiles: [TileId, TileId] } // 窗口内：用自己的两张与弃牌组顺
  | { type: "peng" } // 窗口内
  | { type: "minGang" } // 窗口内
  | { type: "hu" } // 窗口内点炮胡
  | { type: "pass" }; // 窗口内过
```

血战的 `BloodbattleAction`（前置阶段、playing 阶段、杠与抢杠胡动作）：

```ts
type BloodbattleAction =
  | { type: "exchangeThree"; tiles: [TileId, TileId, TileId] } // exchanging：恰好三张、同花色
  | { type: "chooseLack"; suit: "m" | "p" | "s" }; // choosing-lack：必须是自己当前持有的花色
```

血战新增事件（与垃圾胡事件共用信封和可见性规则）：

| 事件                  | visibility     | payload 要点                                                                                          |
| --------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| ExchangeThreeSelected | seat（仅本人） | 选出的三张 TileId                                                                                     |
| ExchangeCompleted     | public         | 交换方向、阶段完成；不含任何 TileId                                                                   |
| TilesReceived         | seat（仅本人） | 收到的三张 TileId                                                                                     |
| LackChosen            | seat（仅本人） | 自己选择的花色                                                                                        |
| HuDeclared            | public         | 血战版额外携带公开牌面胡牌快照（TileKind）、`activeSeats`；内部快照仍从手牌容器接管 TileId            |
| Settled               | public         | `reason`、逐座位增减分；`reason` 为 `win`、`gang`、`gangTransfer`、`huaZhu`、`gangRefund` 或 `daJiao` |

血战 PlayerView 的每个公开 seat 额外带 `status: "active" | "won"`、TileKind 形式的副露/牌河和（若已胡）公开 `winSnapshot`；仅本人的 view 带 TileId 形式的 `hand`、`myLackSuit`、本阶段是否已提交。其他座位的换三张与定缺选择不得泄漏。

`TileDiscarded`、`ClaimWindowOpened`、`PengMade` 等 public 事件只携带 `TileKind`，不得携带可由静态映射反查牌面的 TileId；私有 `TileDrawnPrivate`、选牌事件和内部状态仍可携带 TileId。

- `applyAction(state, seat, action)`：非法即返回 `RuleViolation`（含机器可读 code），state 不变
- server 超时代提交的 `pass` 与玩家主动 `pass` 完全同型（D5）

## 5. GameEvent 清单（垃圾胡全集，16 种）

统一结构：

```ts
type GameEvent = {
  seq: number;
  visibility: { type: "public" } | { type: "seat"; seats: SeatId[] }; // 仅指定座位可见
  payload: EventPayload;
};
```

| #   | 事件                 | visibility                                                            | payload 要点                                     |
| --- | -------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | GameStarted          | public                                                                | config、座次、庄家、各家初始手牌张数、牌墙余量   |
| 2   | HandDealt            | seat（各家各收自己的）                                                | 该家 13/14 张手牌                                |
| 3   | TurnStarted          | public                                                                | seat                                             |
| 4   | TileDrawn            | **双版本**：seat 版含牌面；public 版仅"摸了一张"                      | seat, tile?                                      |
| 5   | TileDiscarded        | public                                                                | seat, tile                                       |
| 6   | ClaimWindowOpened    | seat（仅有权响应者，各自收到自己的选项）                              | 自己的 ClaimOption[]                             |
| 7   | ClaimResponded       | seat（仅本人，作为回执/日志）                                         | 本人的响应                                       |
| 8   | ClaimWindowResolved  | public                                                                | 裁决结果（谁以何动作赢得窗口 / 无人响应）        |
| 9   | ChiMade              | public                                                                | seat, tiles, from                                |
| 10  | PengMade             | public                                                                | seat, tile, from                                 |
| 11  | GangMade             | public（暗杠不露牌面：payload 区分 anGang 时牌面仅 seat 可见→双版本） | seat, type, tile?, from?                         |
| 12  | GangReplacementDrawn | 双版本（同 TileDrawn）                                                | seat, tile?                                      |
| 13  | HuDeclared           | public                                                                | seat, 胡型（点炮/自摸）, 亮出的完整手牌, 点炮者? |
| 14  | Settled              | public                                                                | 分数变动明细                                     |
| 15  | WallExhausted        | public                                                                | —                                                |
| 16  | GameEnded            | public                                                                | result 摘要                                      |

非法动作不进事件日志（不改变状态），仅作为 applyAction 的错误返回：server 以 ack 拒绝该客户端，并记入 server 侧错误日志（logger，非游戏事件；取舍理由见 decisions.md 评审点 D）。原表 #17 已删除。

ClaimWindowOpened 按座位拆分发送各自的选项，避免泄漏他家能做什么。但窗口的**存在与时长**是全桌可观察的行为特征：出牌后瞬时推进 = 无人有响应权；出现停顿 = 至少一家能碰/杠/胡（即使其最终 pass，"能碰而未碰"已是有价值的读牌信息）——已知泄漏，按 D7 口径不做混淆处理（取舍理由见 decisions.md 评审点 E）。

ClaimResponded（#7）仅本人可见，用于回放调试的输入完整性与窗口中途重连恢复（配套：PlayerView 的 myClaimResponse 字段；取舍理由见 decisions.md 评审点 F）。

## 6. PlayerView（PlayerViewBase 骨架 + 各 ruleset 扩展）

engine-api 的公共骨架（`types.ts` 的 `PlayerViewBase`）只含跨玩法一致的字段：

```ts
type PlayerViewBase = {
  seat: SeatId;
  hand: TileId[]; // 仅自己的
  seats: Array<{
    handCount: number; // 四家公开的牌数
  }>;
  wallCount: number;
  currentSeat: SeatId;
};
```

`phase`/`myClaimOptions`/`myClaimResponse`/`lastDiscard`/`result` 以及公开副露、牌河的具体表示都是玩法私有的，各 ruleset 用交叉类型扩展。junk 使用 `TileId` 形式的 `melds`/`discards`，bloodbattle 使用对外安全的 `TileKind` 形式；这些字段不放进公共骨架，避免不同玩法的牌面敏感性和数据形状混在一起。junk 的 `JunkPlayerView`：

```ts
type JunkPlayerView = Omit<PlayerViewBase, "seats"> & {
  seats: Array<{
    melds: Meld[];
    discards: DiscardEntry[];
    handCount: number;
  }>;
  phase: JunkPhase;
  myClaimOptions?: JunkClaimOption[]; // 窗口期间自己的选项
  myClaimResponse?: JunkAction; // 窗口期间自己已提交的表态（重连恢复用，评审点 F）
  lastDiscard?: { seat: SeatId; tile: TileId };
  result?: JunkGameResult;
};
```

- `junkRuleSet.getPlayerView(state, seat)` 纯派生，无时间字段；倒计时 deadline 由 server 在协议层附加（D5）。engine-api 也暴露一个通用的 `getPlayerView(state, seat)`，按 `state.config.rulesetId` 分发到具体 ruleset，返回值收窄为 `PlayerViewBase`（调用方若需要玩法私有字段，用具体 ruleset 的 `getPlayerView` 或做类型收窄）
- 客户端状态 = 初始 PlayerView + 按 seq 应用事件流，两条路径必须收敛（可作为测试不变量：任意时刻 事件重建视图 ≡ getPlayerView）

上述"事件重建 ≡ 直接派生"是核心不变量（decisions.md 评审点 G），测试参数化遍历已注册的 ruleset（`packages/core/test/cross-ruleset-invariants.test.ts` + `test/support/registered-rulesets.ts`）——这是保证断线重连(快照)与正常游玩(事件流)一致的根基，未来加入日麻等新玩法时只需要把其 ruleset 加进注册表，不必重写测试。
