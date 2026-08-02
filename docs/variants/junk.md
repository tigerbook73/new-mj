# 垃圾胡规则（rulesetId: `junk`）

> 状态：v3 定稿，已实现并测试通过（`packages/core/src/rulesets/junk/`）
> 定位：最简玩法，用于验证 core 基建/插件分层
> 本文件内聚了垃圾胡的全部知识：规则、专属类型、专属事件、跨局规则。公共契约见 `contracts/engine-contract.md`；即使某节内容和 `bloodbattle.md` 恰好一样，也各写一份，不互相链接（见 `architecture/variant-boundary.md`）。

## 1. 牌集与开局

- 136 张：万(m)、筒(p)、条(s) 各 1–9 × 4，风牌 东南西北 × 4，箭牌 中发白 × 4；无花牌，无癞子/宝牌
- 4 人，随机定座定庄（由 seed 决定，可复现）
- 庄家 14 张，闲家 13 张；庄家先打
- 无换三张、无定缺等前置阶段

## 2. 行牌规则

- 摸牌：按逆时针轮转，从牌墙头部摸；core 层是显式 `{type:"draw"}` 动作（见 §5 `awaiting-draw` 相位），不是内联副作用——谁/何时提交该动作是 server 编排层职责，不属于本文件范围
- 出牌后进入声明窗口，**优先级：胡 > 杠 > 碰 > 吃**
  - 吃：仅出牌者的下家可吃（即只能吃上家打出的牌）
  - 碰/明杠：任意他家
- 自己回合内：可打出、可暗杠、可补杠（碰后摸到第四张）、可自摸胡
- 杠后从**牌墙尾部**补摸一张（无王牌区，简化处理）

## 3. 胡牌与结算

- 胡牌型 = 4 面子 + 1 对（基本型）或 7 对；起胡无番种门槛
- 可点炮胡（别家打出成胡即可胡），可自摸；一人胡牌，本局立即结束
- 记番，倍数制、可叠加（基础分 1 分 × 命中番型的倍数连乘）：

  | 番型   | 倍数                          | 说明                                                                                                                                                |
  | ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 杠开   | ×2（连续杠开按 2^连杠数翻倍） | 仅自摸生效：这回合的自摸牌本身就是"杠后立即补摸"的替补牌；若中途没打出过牌、连续多次杠，倍数按 2 的幂连乘（2 连杠 ×4，3 连杠 ×8……）。点炮胡不计此项 |
  | 混一色 | ×2                            | 手牌（含副露与胡的那张）只有一种花色 + 字牌，且至少含一张字牌                                                                                       |
  | 清一色 | ×4                            | 手牌只有一种花色，不含字牌；与混一色互斥，互斥性由各自的判定条件本身保证，不需要额外排他逻辑                                                        |
  | 7 对   | ×2                            | 实际以 7 对型胡牌时生效                                                                                                                             |
  | 碰碰胡 | ×2                            | 4 副面子全部是刻子/杠（无吃、无顺子）                                                                                                               |
  | 门清   | ×2                            | 没有吃/碰/被吃的明杠等已声明副露；暗杠不破门清                                                                                                      |

  以上 6 项均硬编码生效，不提供 config 开关。

- 庄家倍率固定为 2，不随连庄局数递增（与杭州"三牢"那种随连庄数递增的倍率机制是两回事，见 §4）：任意一笔涉及庄家的收付——庄家胡牌时别人付给庄家的钱，或庄家点炮/自摸付钱给别家时庄家付的钱——在番型倍数算完后再整体 ×2；这一规则同样硬编码生效，不提供 config 开关
- 流局：牌墙摸完无人胡 → 流局，不计分

## 4. 跨局规则

- **庄家轮换公式**（对应 `contracts/engine-contract.md` §4 的 `computeNextDealer` 契约）：胡牌者坐下一局庄（头跳确保只有一位赢家）；流局则轮转到当前庄家的逆时针下一位（与摸牌方向一致，即 `nextSeat`）。首局庄家仍由 seed 随机决定（见 §1）
- **庄家倍率不是"连庄"意义上的递增倍数**：见 §3，固定 ×2，不随庄家连续坐庄的局数增加而变化——这与杭州麻将"三牢"那种随连庄数递增的倍率机制是两个不同的设计，垃圾胡这里刻意选择了更简单的常数倍率，因此也不需要类似 `dealerStreak` 那样的跨局计数
- **会话排名**：当前复用房间层的通用实现（纯分数从高到低排序），见 `contracts/session-mechanics.md` §4 的现状说明与警示——这不是垃圾胡自己的排名逻辑，只是暂时共用。

## 5. Phase 与 Action（私有类型）

- `JunkPhase`：`dealing → playing ⇄ awaiting-claims ⇄ awaiting-draw → finished`
  - `dealing`：发牌（引擎内部瞬时完成）
  - `playing`：当前家行动（打牌/暗杠/补杠/自摸）
  - `awaiting-claims`：声明窗口
  - `awaiting-draw`：出牌无人应下 / 声明窗口裁决无人胡 / 自杠或被杠后，轮到的座位已确定但还未摸牌——`currentSeat` 已指向该座位，`myActionOptions` 精确为 `[{type:"draw"}]`；提交该动作后转回 `playing`
  - `finished`：有人胡或流局
- `JunkAction`（`packages/core/src/rulesets/junk/types.ts`）：discard/anGang/buGang/zimo/chi/peng/minGang/hu/pass/draw
- `JunkState`/`JunkPendingClaims` 见 `packages/core/src/rulesets/junk/types.ts`；不存在跨玩法共享的全局 `GameState`
- `JunkState` 另有两个私有字段专供 §3 计分使用：`dealer`（本局庄家座位，整局固定不变；跨局延续是 `computeNextJunkDealer` 的职责，不由这个字段本身表达）与 `gangChain`（每座位的连续杠计数器，供"杠开"倍数用：暗杠/补杠/被碰后又补杠都 `+1`，该座位自己打出一张牌就清零——判定逻辑与杭州 `gangChain` 同构，见 `hangzhou.md` §6）

`source='robKong'` 出现在每次补杠：补杠第四张在声明窗口结束前仍留在补杠者手牌，不创建牌河条目；只有全员 pass 后才转入 `buGang` 副露并尾部补摸；若有人胡，该牌仍归补杠者手牌，胡牌事件亮出它但不制造容器重复。

## 6. 事件清单（垃圾胡全集，17 种）

信封结构（`GameEvent`/`EventVisibility`）见 `contracts/engine-contract.md` §6，本节只列本玩法的具体事件。

| #   | 事件                 | visibility                                   | payload 要点                                                                                                                                                                                                                                                   |
| --- | -------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | GameStarted          | public                                       | config、座次、庄家、各家初始手牌张数、牌墙余量                                                                                                                                                                                                                 |
| 2   | HandDealt            | seat（各家各收自己的）                       | 该家 13/14 张手牌                                                                                                                                                                                                                                              |
| 3   | TurnStarted          | public                                       | seat                                                                                                                                                                                                                                                           |
| 4   | TileDrawn            | 双版本：seat 版含牌面；public 版仅"摸了一张" | seat, tile?                                                                                                                                                                                                                                                    |
| 5   | TileDiscarded        | public                                       | seat, tile                                                                                                                                                                                                                                                     |
| 6   | ClaimWindowOpened    | seat（仅有权响应者）                         | 自己的 ClaimOption[]                                                                                                                                                                                                                                           |
| 7   | ClaimResponded       | seat（仅本人）                               | 本人的响应                                                                                                                                                                                                                                                     |
| 8   | ClaimWindowResolved  | public                                       | 裁决结果；`result:"unclaimed"` 时额外带 `seat`（下一位即将摸牌的座位，供事件重建判断）                                                                                                                                                                         |
| 9   | ChiMade              | public                                       | seat, tiles, from                                                                                                                                                                                                                                              |
| 10  | PengMade             | public                                       | seat, tile, from                                                                                                                                                                                                                                               |
| 11  | GangMade             | public（暗杠不露牌面，双版本）               | seat, type, tile?, from?                                                                                                                                                                                                                                       |
| 12  | GangReplacementDrawn | 双版本（同 TileDrawn）                       | seat, tile?                                                                                                                                                                                                                                                    |
| 13  | HuDeclared           | public                                       | seat, 胡型（点炮/自摸）, 亮出的完整手牌(`hand`), `winTile`, `groups`（实际拆分，见 §7）, `fanTypes`（命中的番型 id 列表，见 §3）, `multiplier`（§3 番型倍数的连乘结果，不含庄家倍率——庄家倍率只体现在 `Settled` 的 `scoreDeltas` 里，不重复写进这里）, 点炮者? |
| 14  | Settled              | public                                       | 分数变动明细                                                                                                                                                                                                                                                   |
| 15  | WallExhausted        | public                                       | —                                                                                                                                                                                                                                                              |
| 16  | GameEnded            | public                                       | result 摘要；胡牌时保留数字 `winners` 座位列表，并在 `winnerDetails` 提供 seat、fanTypes、multiplier、payout，供结算快照和重连渲染                                                                                                                             |
| 17  | LegalActionsUpdated  | seat（每家各收自己的）                       | 该 seat 当前完整可执行的 JunkAction[]                                                                                                                                                                                                                          |

`ClaimResponded`（#7）仅本人可见，用于回放调试的输入完整性与窗口中途重连恢复（配套：PlayerView 的 `myClaimResponse` 字段）。

## 7. PlayerView 私有字段

`JunkPlayerView`（`packages/core/src/rulesets/junk/types.ts`）在 `PlayerViewBase` 之上扩展：`phase`/`myActionOptions`/`myClaimOptions`/`myClaimResponse`/`lastDiscard`/`justDrawn`/`result`/`dealer`，以及 `TileId` 形式的 `melds`/`discards`（垃圾胡选择用 TileId，不是 TileKind——不同玩法可以有不同选择，见 `contracts/engine-contract.md` §5）。`dealer` 是**公开**字段（本局庄家座位，整局固定，供客户端展示"庄家倍率"提示用），仿杭州 `dealerStreak` 的公开方式。`myActionOptions` 是自己的完整可执行列表；`awaiting-claims` 时其中含可声明动作及 `pass`，而 `myClaimOptions` 继续只表示声明选项。#17 在每个成功的状态转换后为每个座位发送，保证事件重建与直接派生一致。

`seats[i].winSnapshot?: { hand: TileKind[]; winTile: TileKind; groups: TileKind[][] }`——**公开**，仅胡牌那一刻起该座位才有此字段（`state.wins[seat]` 落地时写入，直到整局结束不再清除），仿血战到底 `WinSnapshot`/`PublicWinSnapshot` 的公开揭示模式：`hand`/`winTile` 在私有状态（`TileId`）与 `PlayerView`（转换成 `TileKind`）之间做边界转换，`groups` 是实际用来判定胡牌的拆分（4 面子+1 将，或七对型的 7 组），本来就是 kind 级别不需要转换。`groups` 的家族优先级（先试基本型再试七对，`own.melds.length===0` 时）与 `isWin` 逐字复刻，保证与实际判定一致，不存在多解歧义。

`justDrawn` 是这份清单里唯一分两层可见性的字段：`seats[].justDrawn`（布尔）公开给所有座位，标记"这一家现在是不是刚摸牌、还没对它/本回合做出行动"——这件事本身从来不是秘密（配套的 public `TileDrawn`/`GangReplacementDrawn` 事件本就不带 `tile`，只是不告诉你摸到了什么）；顶层 `justDrawn?: TileId` 只在请求视角正好是刚摸牌的那一家时才附加，用来在自己视角显示真实牌面。两者都在该家 discard/anGang/buGang 提交时一起清空（robKong 待裁决窗口期间保持"仍在摸牌决策中"直到裁决落定，见 `packages/core/src/rulesets/junk/state-machine.ts` 的 `resolveUnclaimed`）。庄家开局多摸的第 14 张牌视同一次摸牌，`createJunkGame` 发牌后即设置 `justDrawn`，语义与后续每回合的摸牌完全一致。

## 8. Config 清单（v3 无可开关项）

| 选项            | 默认建议 | 说明                 |
| --------------- | -------- | -------------------- |
| `sevenPairs`    | 移除     | 七对是固定合法胡牌型 |
| `robKong`       | 移除     | 抢杠胡固定允许       |
| `multiHuPolicy` | 移除     | 多家同时点炮固定头跳 |

旧输入显式传入这三项时会被拒绝，不会静默改变规则。

## 9. 已知信息泄漏（记录，不处理）

声明窗口的存在/时长可能向他家暗示"有人能碰/杠/胡"。非商用项目不做混淆处理，记录备查。

## 10. 状态

v3 定稿（新增 §3 记番计分与 §4 胡牌者坐庄），已实现并测试通过；fuzz 1000 局通过。
