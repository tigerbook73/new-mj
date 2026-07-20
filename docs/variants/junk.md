# 垃圾胡规则（rulesetId: `junk`）

> 状态：v2 定稿，阶段 1 已实现并测试通过（`packages/core/src/rulesets/junk/`）
> 定位：最简玩法，用于验证 core 基建/插件分层（`decisions.md` D9）
> 本文件内聚了垃圾胡的全部知识：规则、专属类型、专属事件、跨局规则。公共契约见 `contracts/engine-contract.md`；即使某节内容和 `bloodbattle.md` 恰好一样，也各写一份，不互相链接（见 `architecture/variant-boundary.md`）。

## 1. 牌集与开局

- 136 张：万(m)、筒(p)、条(s) 各 1–9 × 4，风牌 东南西北 × 4，箭牌 中发白 × 4；无花牌，无癞子/宝牌
- 4 人，随机定座定庄（由 seed 决定，可复现）
- 庄家 14 张，闲家 13 张；庄家先打
- 无换三张、无定缺等前置阶段

## 2. 行牌规则

- 摸牌：按逆时针轮转，从牌墙头部摸（引擎自动执行，非玩家 action）
- 出牌后进入声明窗口，**优先级：胡 > 杠 > 碰 > 吃**
  - 吃：仅出牌者的下家可吃（即只能吃上家打出的牌）
  - 碰/明杠：任意他家
- 自己回合内：可打出、可暗杠、可补杠（碰后摸到第四张）、可自摸胡
- 杠后从**牌墙尾部**补摸一张（无王牌区，简化处理）

## 3. 胡牌与结算

- 胡牌型 = 4 面子 + 1 对（基本型），无任何番种/起胡要求
- 可点炮胡（别家打出成胡即可胡），可自摸；一人胡牌，本局立即结束
- 不记番。固定分：点炮胡——点炮者付 1 分给胡家；自摸——三家各付 1 分给胡家
- 杠不计分（简化）
- 流局：牌墙摸完无人胡 → 流局，不计分

## 4. 跨局规则

- **不记连庄**：本局结束即完结，无庄家延续概念。
- **庄家轮换公式**（对应 `contracts/engine-contract.md` §4 的 `computeNextDealer` 契约）：不看上一局结果，顺时针轮转。这是当前实现，不是永久假设——如果以后垃圾胡要加连庄玩法，只改这里的实现，不动契约签名或房间编排代码。
- **会话排名**：当前复用房间层的通用实现（纯分数从高到低排序），见 `contracts/session-mechanics.md` §4 的现状说明与警示——这不是垃圾胡自己的排名逻辑，只是暂时共用。

## 5. Phase 与 Action（私有类型）

- `JunkPhase`：`dealing → playing ⇄ awaiting-claims → finished`
  - `dealing`：发牌（引擎内部瞬时完成）
  - `playing`：当前家行动（打牌/暗杠/补杠/自摸）
  - `awaiting-claims`：声明窗口
  - `finished`：有人胡或流局
- `JunkAction`（`packages/core/src/rulesets/junk/types.ts`）：discard/anGang/buGang/zimo/chi/peng/minGang/hu/pass
- `JunkState`/`JunkPendingClaims` 见 `packages/core/src/rulesets/junk/types.ts`；不存在跨玩法共享的全局 `GameState`（`decisions.md` D12）

`source='robKong'` 仅在 `robKong=true` 时出现：补杠第四张在声明窗口结束前仍留在补杠者手牌，不创建牌河条目；只有全员 pass 后才转入 `buGang` 副露并尾部补摸；若有人胡，该牌仍归补杠者手牌，胡牌事件亮出它但不制造容器重复。

## 6. 事件清单（垃圾胡全集，16 种）

信封结构（`GameEvent`/`EventVisibility`）见 `contracts/engine-contract.md` §6，本节只列本玩法的具体事件。

| #   | 事件                 | visibility                                   | payload 要点                                     |
| --- | -------------------- | -------------------------------------------- | ------------------------------------------------ |
| 1   | GameStarted          | public                                       | config、座次、庄家、各家初始手牌张数、牌墙余量   |
| 2   | HandDealt            | seat（各家各收自己的）                       | 该家 13/14 张手牌                                |
| 3   | TurnStarted          | public                                       | seat                                             |
| 4   | TileDrawn            | 双版本：seat 版含牌面；public 版仅"摸了一张" | seat, tile?                                      |
| 5   | TileDiscarded        | public                                       | seat, tile                                       |
| 6   | ClaimWindowOpened    | seat（仅有权响应者）                         | 自己的 ClaimOption[]                             |
| 7   | ClaimResponded       | seat（仅本人）                               | 本人的响应                                       |
| 8   | ClaimWindowResolved  | public                                       | 裁决结果                                         |
| 9   | ChiMade              | public                                       | seat, tiles, from                                |
| 10  | PengMade             | public                                       | seat, tile, from                                 |
| 11  | GangMade             | public（暗杠不露牌面，双版本）               | seat, type, tile?, from?                         |
| 12  | GangReplacementDrawn | 双版本（同 TileDrawn）                       | seat, tile?                                      |
| 13  | HuDeclared           | public                                       | seat, 胡型（点炮/自摸）, 亮出的完整手牌, 点炮者? |
| 14  | Settled              | public                                       | 分数变动明细                                     |
| 15  | WallExhausted        | public                                       | —                                                |
| 16  | GameEnded            | public                                       | result 摘要                                      |

`ClaimResponded`（#7）仅本人可见，用于回放调试的输入完整性与窗口中途重连恢复（配套：PlayerView 的 `myClaimResponse` 字段）。

## 7. PlayerView 私有字段

`JunkPlayerView`（`packages/core/src/rulesets/junk/types.ts`）在 `PlayerViewBase` 之上扩展：`phase`/`myClaimOptions`/`myClaimResponse`/`lastDiscard`/`justDrawn`/`result`，以及 `TileId` 形式的 `melds`/`discards`（垃圾胡选择用 TileId，不是 TileKind——不同玩法可以有不同选择，见 `contracts/engine-contract.md` §5）。

`justDrawn` 是这份清单里唯一分两层可见性的字段：`seats[].justDrawn`（布尔）公开给所有座位，标记"这一家现在是不是刚摸牌、还没对它/本回合做出行动"——这件事本身从来不是秘密（配套的 public `TileDrawn`/`GangReplacementDrawn` 事件本就不带 `tile`，只是不告诉你摸到了什么）；顶层 `justDrawn?: TileId` 只在请求视角正好是刚摸牌的那一家时才附加，用来在自己视角显示真实牌面。两者都在该家 discard/anGang/buGang 提交时一起清空（robKong 待裁决窗口期间保持"仍在摸牌决策中"直到裁决落定，见 `packages/core/src/rulesets/junk/state-machine.ts` 的 `resolveUnclaimed`）。庄家开局多摸的第 14 张牌视同一次摸牌，`createJunkGame` 发牌后即设置 `justDrawn`，语义与后续每回合的摸牌完全一致。

## 8. Config 清单（均有默认值，已确认：全取默认）

| 选项            | 默认建议         | 说明                                                                     |
| --------------- | ---------------- | ------------------------------------------------------------------------ |
| `sevenPairs`    | **false ✓**      | 七对是否可胡（关：进一步压薄第一个 RuleSet；血战阶段自然会实现）         |
| `robKong`       | **false ✓**      | 抢杠胡（他家补杠时可胡该张）是否允许                                     |
| `multiHuPolicy` | **'headJump' ✓** | 多家可同时点炮胡时：头跳（按逆时针最近者独胡）或 'all'（均胡）。头跳最简 |

第一版三项全取默认（最简），使垃圾胡 RuleSet 体量最小；config 解析与 fuzz 随机化已按 `decisions.md` D8 口径覆盖三项。

## 9. 已知信息泄漏（记录，不处理）

声明窗口的存在/时长可能向他家暗示"有人能碰/杠/胡"。非商用项目不做混淆处理（`decisions.md` D7 口径），记录备查。

## 10. 状态

v2 定稿，阶段 1 已实现并测试通过；fuzz 1000 局通过。相关决策：D9（垃圾胡为第一玩法的理由）。
