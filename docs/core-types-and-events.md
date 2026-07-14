# core 类型与事件清单

> 状态：v2，评审点 A–G 已定稿。定稿后作为 `packages/core` 的实现依据
> 原则回顾：applyAction 对外纯函数；时间不进 core；事件带可见性（D4/D5）

## 1. 基础类型

```ts
// 牌的种类：字符串字面量，采用 m/p/s/z 记法
// '1m'–'9m' 万 | '1p'–'9p' 筒 | '1s'–'9s' 条
// '1z'东 '2z'南 '3z'西 '4z'北 '5z'白 '6z'发 '7z'中
type TileKind = string  // 用模板字面量类型收紧

// 牌的实例：每张物理牌有唯一 id（0..N-1，N 由 RuleSet 牌集决定）
// id → kind 为静态表，由 RuleSet 牌集按规范顺序派生：kindOf(id): TileKind
type TileId = number

// 座位：core 只认识座位，不认识用户
// userId ↔ SeatId 的映射由 server 维护（AI 与真人在 core 层无差别）
type SeatId = 0 | 1 | 2 | 3

type MeldType = 'chi' | 'peng' | 'minGang' | 'anGang' | 'buGang'
type Meld = { type: MeldType; tiles: TileId[]; from?: SeatId }
```

**评审点 A【已定：采用实例 ID】**：状态与事件存 `TileId`；规则逻辑（胡牌判定、碰杠匹配）经 `kindOf(id)` 按种类运算。理由：① React/Motion 动画需要稳定 key，一张牌从牌墙→手牌→牌河全程同 id，layout 动画免费；② 牌集守恒不变量 = id 集合精确比对。
**配套纪律（安全）**：id→kind 映射静态公开，因此**暴露 id 等于暴露牌面**——一切可见性过滤须将 id 与 kind 视为同级敏感（TileDrawn/暗杠的 public 版本均不得携带 id）。
**配套约定（测试）**：fixture 中用例仍以 kind 书写（如 `[1m,2m,3m]`），由加载器自动派发 id。

## 2. GameState

```ts
type GameState = {
  config: GameConfig            // { rulesetId, ...变体 config }，随对局持久化
  phase: Phase                  // 见 §3
  wall: TileId[]                // 剩余牌墙（头部摸牌、尾部杠补）
  seats: SeatState[]            // 长度 4
  currentSeat: SeatId
  lastDiscard?: { seat: SeatId; tile: TileId }
  pendingClaims?: PendingClaims // 声明窗口期间存在
  seq: number                   // 已发出事件的最大序号
  prng: PrngState               // 可序列化的 PRNG 状态（seed 派生）
  variantState: unknown         // 变体私有状态命名空间（D6；垃圾胡为空对象）
  result?: GameResult           // 终局后填充
}

type SeatState = {
  hand: TileId[]                // 手牌（暗牌）
  melds: Meld[]                 // 副露（明牌）
  discards: DiscardEntry[]      // 牌河（按出牌者归属，可见性公开）
}

// 牌河条目：被吃/碰/杠拿走的牌条目留在原位，标注 claimedBy（墓碑）
// —— 保留位置与完整弃牌历史：UI 可自选留空/紧凑渲染；日麻振听判定将来直接可用
type DiscardEntry = { tile: TileId; claimedBy?: SeatId }

type PendingClaims = {
  discard: { seat: SeatId; tile: TileId }
  options: Partial<Record<SeatId, ClaimOption[]>>  // 仅含有权响应的座位
  responses: Partial<Record<SeatId, Action | 'pass'>>
}
```

**容器唯一性约定**：任一 TileId 任意时刻**物理上**只归属一个容器——牌墙 / 某家手牌 / 某家牌河**活跃条目**（claimedBy 为空）/ 某家副露 / 胡牌快照。牌打出即入出牌者牌河；被吃/碰/杠时，牌的物理归属移入声明者副露（Meld.from 记录来源家），牌河条目原位保留并置 claimedBy（墓碑，不计入守恒）。"牌集守恒"不变量 = 上述容器的 TileId 并集恒等于完整牌集且两两不相交；附加不变量：每个墓碑条目的 TileId 必出现在 claimedBy 家的某个副露中。

**评审点 B【已定：维持】**：`pendingClaims.options` 只包含**至少有一个合法响应**的座位；无选项的家不进窗口、无需表态，server 的超时计时也只针对这些座位。（备选方案为商用做法：出牌后强制全部三家进窗口表态 pass + 固定时长，以掩盖"谁有选项"；按 D7 口径不采用，泄漏见评审点 E。）

## 3. Phase（垃圾胡的状态机）

```
dealing → playing ⇄ awaiting-claims → finished
```

- `dealing`：发牌（引擎内部瞬时完成，产出发牌事件后进入 playing）
- `playing`：当前家行动（打牌/暗杠/补杠/自摸）
- `awaiting-claims`：声明窗口（见规则文档）
- `finished`：有人胡或流局

血战将在此序列前插入 `exchanging`（换三张）、`choosing-lack`（定缺）等阶段——阶段作为 RuleSet 提供的流程定义的一部分（阶段 1.5 时定型具体接口）。

**评审点 C【已定：采纳】（摸牌为自动转移）**：摸牌不是玩家 Action，杠后补摸同理。上一动作的裁决结果若为"轮到某家摸牌"，引擎在同一次 `applyAction` 内自动完成摸牌、发出 TileDrawn 事件并进入该家的 playing。由于牌墙顺序由 seed 固定，这不破坏确定性，且省去一类无意义的客户端往返。摸牌均有事件（#4/#12，双版本），客户端据此渲染摸牌动画：他家播牌背飞入，自己播牌面飞入。

## 4. Action

```ts
type Action =
  | { type: 'discard'; tile: TileId }
  | { type: 'anGang'; kind: TileKind }    // 自己回合（四张同种，按种类指定）
  | { type: 'buGang'; tile: TileId }      // 自己回合
  | { type: 'zimo' }                      // 自己回合自摸胡
  | { type: 'chi'; tiles: [TileId, TileId] } // 窗口内：用自己的两张与弃牌组顺
  | { type: 'peng' }                      // 窗口内
  | { type: 'minGang' }                   // 窗口内
  | { type: 'hu' }                        // 窗口内点炮胡
  | { type: 'pass' }                      // 窗口内过
```

- `applyAction(state, seat, action)`：非法即返回 `RuleViolation`（含机器可读 code），state 不变
- server 超时代提交的 `pass` 与玩家主动 `pass` 完全同型（D5）

## 5. GameEvent 清单（垃圾胡全集，16 种）

统一结构：

```ts
type GameEvent = {
  seq: number
  visibility:
    | { type: 'public' }
    | { type: 'seat'; seats: SeatId[] }   // 仅指定座位可见
  payload: EventPayload
}
```

| # | 事件 | visibility | payload 要点 |
|---|------|-----------|-------------|
| 1 | GameStarted | public | config、座次、庄家 |
| 2 | HandDealt | seat（各家各收自己的） | 该家 13/14 张手牌 |
| 3 | TurnStarted | public | seat |
| 4 | TileDrawn | **双版本**：seat 版含牌面；public 版仅"摸了一张" | seat, tile? |
| 5 | TileDiscarded | public | seat, tile |
| 6 | ClaimWindowOpened | seat（仅有权响应者，各自收到自己的选项） | 自己的 ClaimOption[] |
| 7 | ClaimResponded | seat（仅本人，作为回执/日志） | 本人的响应 |
| 8 | ClaimWindowResolved | public | 裁决结果（谁以何动作赢得窗口 / 无人响应） |
| 9 | ChiMade | public | seat, tiles, from |
| 10 | PengMade | public | seat, tile, from |
| 11 | GangMade | public（暗杠不露牌面：payload 区分 anGang 时牌面仅 seat 可见→双版本） | seat, type, tile?, from? |
| 12 | GangReplacementDrawn | 双版本（同 TileDrawn） | seat, tile? |
| 13 | HuDeclared | public | seat, 胡型（点炮/自摸）, 亮出的完整手牌, 点炮者? |
| 14 | Settled | public | 分数变动明细 |
| 15 | WallExhausted | public | — |
| 16 | GameEnded | public | result 摘要 |

**评审点 D【已定：采纳】**：非法动作不进事件日志（不改变状态），仅作为 applyAction 的错误返回：server 以 ack 拒绝该客户端，并记入 server 侧错误日志（logger，非游戏事件）。原表 #17 已删除。

**评审点 E【已定：维持，泄漏记录在案】**：ClaimWindowOpened 按座位拆分发送各自的选项，避免泄漏他家能做什么。但窗口的**存在与时长**是全桌可观察的行为特征：出牌后瞬时推进 = 无人有响应权；出现停顿 = 至少一家能碰/杠/胡（即使其最终 pass，"能碰而未碰"已是有价值的读牌信息）。对策（全员强制表态 + 固定时长）按 D7 不采用。

**评审点 F【已定：保留】**：ClaimResponded（#7）仅本人可见。两个作用：① 回放调试的输入完整性——ClaimWindowResolved 只有裁决结果，不含各家表态内容与时序，缺它无法定位裁决 bug 是输入错还是裁决错；② 窗口中途重连的恢复——已表态者重连后 UI 须显示"等待他家"而非重新弹选项（配套：PlayerView 增加 myClaimResponse 字段）。

## 6. PlayerView

```ts
type PlayerView = {
  seat: SeatId
  hand: TileId[]                     // 仅自己的
  seats: Array<{                     // 四家公开信息
    melds: Meld[]                    // 暗杠牌面对他人隐藏
    discards: DiscardEntry[]
    handCount: number
  }>
  wallCount: number
  currentSeat: SeatId
  phase: Phase
  myClaimOptions?: ClaimOption[]     // 窗口期间自己的选项
  myClaimResponse?: Action | 'pass'  // 窗口期间自己已提交的表态（重连恢复用，评审点 F）
  lastDiscard?: { seat: SeatId; tile: TileId }
  result?: GameResult
}
```

- `getPlayerView(state, seat)` 纯派生，无时间字段；倒计时 deadline 由 server 在协议层附加（D5）
- 客户端状态 = 初始 PlayerView + 按 seq 应用事件流，两条路径必须收敛（可作为测试不变量：任意时刻 事件重建视图 ≡ getPlayerView）

**评审点 G【已定：采纳】**：上述"事件重建 ≡ 直接派生"作为核心不变量加入阶段 1 测试清单——这是保证断线重连(快照)与正常游玩(事件流)一致的根基。
