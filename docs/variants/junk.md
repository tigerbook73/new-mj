# 垃圾胡规则（rulesetId: `junk`）

> 状态：v3 规则已确认，待实现（`packages/core/src/rulesets/junk/` 仍是 v2）
> 定位：最简玩法，用于验证 core 基建/插件分层
> 本文件内聚了垃圾胡的全部知识：规则、专属类型、专属事件、跨局规则。公共契约见 `contracts/engine-contract.md`；即使某节内容和 `bloodbattle.md` 恰好一样，也各写一份，不互相链接（见 `architecture/variant-boundary.md`）。

## 1. 牌集与开局

- 136 张：万(m)、筒(p)、条(s) 各 1–9 × 4，风牌 东南西北 × 4，箭牌 中发白 × 4；无花牌，无癞子/宝牌
- 4 人，随机定座；**第 1 局庄家**由本玩法的 `computeInitialDealer(seed)` 从四个座位确定，必须只依赖 seed、可复现
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

- 胡牌型 = 4 面子 + 1 对（基本型）或七小对；无起胡门槛
- 可点炮胡（别家打出成胡即可胡），可自摸；一人胡牌，本局立即结束
- 底分固定为 1。每个赢家独立计算 `multiplier`，等于所有**可同时成立**番型倍率相乘；点炮胡由点炮者向每位赢家支付 `multiplier` 分，自摸由其余三家各向赢家支付 `multiplier` 分
- 杠不计分（简化）
- 流局：牌墙摸完无人胡 → 流局，不计分

### 番型（全部已确认）

| 番型   |  倍率 | 成立条件                                                                                                              |
| ------ | ----: | --------------------------------------------------------------------------------------------------------------------- |
| 庄家胡 |    ×2 | 赢家座位等于本局庄家；只在庄家是赢家时成立                                                                            |
| 杠开   | ×2 起 | 赢家自摸的牌是自己刚杠后的尾部补牌；其本回合尚未弃牌的连续杠数为 `n` 时倍率为 `2^n`（杠开 ×2、二连杠开 ×4，依此类推） |
| 混一色 |    ×2 | 全部牌只含一种数牌花色与字牌，且至少含一张字牌                                                                        |
| 清一色 |    ×4 | 全部牌只含一种数牌花色，不含字牌                                                                                      |
| 七小对 |    ×2 | 门前 14 张牌恰为七个对子；不得有任何副露                                                                              |
| 碰碰胡 |    ×2 | 基本型的四个面子全部是刻子或杠子；允许副露                                                                            |
| 门清   |    ×2 | 未吃、碰、明杠或补杠；暗杠不破门清                                                                                    |

- 同一手中可成立的不同番型全部相乘，例如庄家门清清一色自摸为 `1 × 2 × 2 × 4 = 16` 分；若该自摸还是二连杠开，则再乘 ×4
- 混一色与清一色互斥；七小对与碰碰胡互斥。这里的互斥不是"不叠加"例外，而是同一副牌不能同时满足两者的定义
- 连续杠数按座位单独追踪：暗杠、明杠、补杠均使该座位的链 +1；该座位弃牌后清零。只有链条最后一次杠的补牌自摸才计杠开；点炮胡不计杠开

## 4. 跨局规则

- **首局定庄**：调用 `RulesetModule.computeInitialDealer(seed) → SeatId`；Junk 用 seed 驱动的 PRNG 从四个座位随机选一位。Room 只提供 seed、保存返回值并创建游戏，不理解随机公式
- **赢家坐庄 / 连庄**：有赢家时，下一局庄家为 `result.winner`。头跳时它就是唯一赢家；允许一炮多响的 `all` 策略时，沿用 result 的主赢家（离点炮者最近者）作为下一局庄家，避免一局产生多个庄家
- **流局轮庄：待确认**。需求只指定"后续赢家坐庄"，未规定无人胡时原庄家是否连庄或顺时针轮庄；实现前必须补充此条，不能静默沿用 v2 的顺时针公式
- **`dealerStreak`**：Room 继续以相邻两局庄家座位是否相等计算连续次数并注入下一局 config；Junk 当前不以它影响合法性，但结算中的"庄家胡 ×2"读取本局 dealer，不读取该计数
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

`source='robKong'` 仅在 `robKong=true` 时出现：补杠第四张在声明窗口结束前仍留在补杠者手牌，不创建牌河条目；只有全员 pass 后才转入 `buGang` 副露并尾部补摸；若有人胡，该牌仍归补杠者手牌，胡牌事件亮出它但不制造容器重复。

## 6. 事件清单（垃圾胡全集，17 种）

信封结构（`GameEvent`/`EventVisibility`）见 `contracts/engine-contract.md` §6，本节只列本玩法的具体事件。

| #   | 事件                 | visibility                                   | payload 要点                                                                           |
| --- | -------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | GameStarted          | public                                       | config、座次、庄家、各家初始手牌张数、牌墙余量                                         |
| 2   | HandDealt            | seat（各家各收自己的）                       | 该家 13/14 张手牌                                                                      |
| 3   | TurnStarted          | public                                       | seat                                                                                   |
| 4   | TileDrawn            | 双版本：seat 版含牌面；public 版仅"摸了一张" | seat, tile?                                                                            |
| 5   | TileDiscarded        | public                                       | seat, tile                                                                             |
| 6   | ClaimWindowOpened    | seat（仅有权响应者）                         | 自己的 ClaimOption[]                                                                   |
| 7   | ClaimResponded       | seat（仅本人）                               | 本人的响应                                                                             |
| 8   | ClaimWindowResolved  | public                                       | 裁决结果；`result:"unclaimed"` 时额外带 `seat`（下一位即将摸牌的座位，供事件重建判断） |
| 9   | ChiMade              | public                                       | seat, tiles, from                                                                      |
| 10  | PengMade             | public                                       | seat, tile, from                                                                       |
| 11  | GangMade             | public（暗杠不露牌面，双版本）               | seat, type, tile?, from?                                                               |
| 12  | GangReplacementDrawn | 双版本（同 TileDrawn）                       | seat, tile?                                                                            |
| 13  | HuDeclared           | public                                       | seat, 胡型（点炮/自摸）, 亮出的完整手牌, 点炮者?                                       |
| 14  | Settled              | public                                       | 分数变动明细                                                                           |
| 15  | WallExhausted        | public                                       | —                                                                                      |
| 16  | GameEnded            | public                                       | result 摘要                                                                            |
| 17  | LegalActionsUpdated  | seat（每家各收自己的）                       | 该 seat 当前完整可执行的 JunkAction[]                                                  |

`ClaimResponded`（#7）仅本人可见，用于回放调试的输入完整性与窗口中途重连恢复（配套：PlayerView 的 `myClaimResponse` 字段）。

## 7. PlayerView 私有字段

`JunkPlayerView`（`packages/core/src/rulesets/junk/types.ts`）在 `PlayerViewBase` 之上扩展：`phase`/`myActionOptions`/`myClaimOptions`/`myClaimResponse`/`lastDiscard`/`justDrawn`/`result`，以及 `TileId` 形式的 `melds`/`discards`（垃圾胡选择用 TileId，不是 TileKind——不同玩法可以有不同选择，见 `contracts/engine-contract.md` §5）。`myActionOptions` 是自己的完整可执行列表；`awaiting-claims` 时其中含可声明动作及 `pass`，而 `myClaimOptions` 继续只表示声明选项。#17 在每个成功的状态转换后为每个座位发送，保证事件重建与直接派生一致。

`justDrawn` 是这份清单里唯一分两层可见性的字段：`seats[].justDrawn`（布尔）公开给所有座位，标记"这一家现在是不是刚摸牌、还没对它/本回合做出行动"——这件事本身从来不是秘密（配套的 public `TileDrawn`/`GangReplacementDrawn` 事件本就不带 `tile`，只是不告诉你摸到了什么）；顶层 `justDrawn?: TileId` 只在请求视角正好是刚摸牌的那一家时才附加，用来在自己视角显示真实牌面。两者都在该家 discard/anGang/buGang 提交时一起清空（robKong 待裁决窗口期间保持"仍在摸牌决策中"直到裁决落定，见 `packages/core/src/rulesets/junk/state-machine.ts` 的 `resolveUnclaimed`）。庄家开局多摸的第 14 张牌视同一次摸牌，`createJunkGame` 发牌后即设置 `justDrawn`，语义与后续每回合的摸牌完全一致。

## 8. Config 清单（均有默认值，已确认：全取默认）

| 选项            | 默认建议         | 说明                                                                     |
| --------------- | ---------------- | ------------------------------------------------------------------------ |
| `sevenPairs`    | **移除**         | v3 七小对是固定规则，不再由客户端或房间 config 开关                      |
| `robKong`       | **false ✓**      | 抢杠胡（他家补杠时可胡该张）是否允许                                     |
| `multiHuPolicy` | **'headJump' ✓** | 多家可同时点炮胡时：头跳（按逆时针最近者独胡）或 'all'（均胡）。头跳最简 |

`robKong`/`multiHuPolicy` 延续 v2；`sevenPairs` 从 config 移除，旧输入在迁移实现时应被拒绝而非静默改变规则。

## 9. 已知信息泄漏（记录，不处理）

声明窗口的存在/时长可能向他家暗示"有人能碰/杠/胡"。非商用项目不做混淆处理，记录备查。

## 10. 状态

v3 规则已确认、待实现。实现需同步扩展结果中的赢家番型/倍率/支付明细，补核心单测、server 连续对局测试与 ≥1000 局 fuzz；流局轮庄是唯一未拍板的规则项。
