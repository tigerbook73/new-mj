# 血战到底规则（rulesetId: `bloodbattle`）

> 状态：v2 定稿，阶段 1.5 已实现并测试通过（`packages/core/src/rulesets/bloodbattle/`）。采用大众线上川麻「血战到底 + 换三张」口径，地方差异仅通过本文件 §6 的 config 表达。
> 本文件内聚了血战到底的全部知识：规则、专属类型、专属事件、跨局规则。公共契约见 `contracts/engine-contract.md`；即使某节内容和 `junk.md` 恰好一样，也各写一份，不互相链接（见 `architecture/variant-boundary.md`）。

## 1. 牌集与开局

- 108 张：仅万、筒、条（无字牌、无花牌）
- 4 人；庄家 14 张、闲家 13 张
- **换三张**（标准配置开启）：四家各自私下选 3 张同花色牌；四家均提交后，按 `state.prng` 均匀决定向左、向右或对家交换。选牌与收到的牌只对本人可见，交换完成才公开方向与阶段完成。
- **定缺**（必选阶段）：换牌后，各家私下从自己仍持有的花色中选一门；四家均提交后进入行牌。定缺花色只对本人可见。

## 2. 行牌规则

- 无吃。声明窗口优先级：**胡 > 杠 > 碰**
- 杠：明杠、暗杠、补杠；杠后从牌墙尾部补摸
- 手中仍有缺门牌时，出牌只能选择缺门牌，且不得碰、杠或胡；缺门牌清空后恢复正常行动
- 四人同时有同优先级声明时，按从出牌者下一家开始的行牌方向裁决；但多家 `hu` 按 §3 的 `multiWinOnDiscard` 处理

## 3. 胡牌与血战流程

- 胡牌前提：不含自己定缺花色，且为基本型（4 面子 + 1 对）或七对
- **胡后不结束**：胡家亮出完整和牌快照并离场；其牌从手牌容器移入该快照，之后不再摸、打、声明，也不参与后续自摸、杠分、查花猪或查大叫的收付。此前已经发生的收付保留
- 三家胡牌立即结束；否则牌墙头尾均无牌可摸时，在最后一次弃牌的声明窗口裁决后流局
- 一炮多响：标准配置**允许**，多家均胡，点炮者分别支付
- 抢杠胡：允许（他家补杠时可抢）

## 4. 结算与番型

底分 1 分，胡牌分 = `baseScore × 2^min(rawFan, capFan)`；`capFan=null` 表示不封顶。点炮只由放炮的仍在场玩家支付；自摸由全部其他仍在场玩家各自支付。`selfDrawBonus='addFan'` 时自摸加 1 番；`'addBase'` 时不加番、但每位付款人额外加付 1 个底分。自摸、杠上花、海底捞月等操作番参与封顶。

**番型表（标准配置）**：

| 组别                   | 番型                     | 番数  | 规则                                                     |
| ---------------------- | ------------------------ | ----- | -------------------------------------------------------- |
| 基础型（互斥，取其一） | 平胡                     | 0     | 基本型                                                   |
|                        | 对对胡                   | 1     | 4 刻子 + 对                                              |
|                        | 七对                     | 2     | 7 个对子                                                 |
|                        | 龙七对                   | 3     | 七对中至少一组四张相同；已含第一个根                     |
|                        | 金钩钓                   | 1     | 已有四副副露，手中仅剩一张单钓                           |
| 牌型附加（可累加）     | 清一色                   | +2    | 所有牌仅一种花色                                         |
|                        | 根                       | +1/个 | 和牌快照与副露中每组四张相同；龙七对的第一个根不重复计算 |
| 操作附加（可累加）     | 自摸                     | +1    | `selfDrawBonus='addFan'` 时                              |
|                        | 杠上花 / 杠上炮 / 抢杠胡 | +1    | 见下文触发条件                                           |
|                        | 海底捞月 / 海底炮        | +1    | 最后一次正常摸牌自摸 / 该次摸牌后弃牌点炮                |

`清对`、`清七对`、`清龙七对`、`清金钩钓`是展示名，不是额外番型：分别由上述基础型加清一色导出，绝不重复计分。杠上花是杠后补摸自摸；杠上炮是杠后补摸再弃牌被胡；抢杠胡仅限补杠的第四张，抢杠成功时该补杠不成立，不计根或杠分。

**杠的即时结算（刮风下雨）**：

- 直杠（他家弃出第四张）：放杠者付 2 分
- 补杠：全部其他仍在场玩家各付 1 分
- 暗杠：全部其他仍在场玩家各付 2 分
- 杠上炮触发**呼叫转移**：开杠者已收到的该次杠分转给胡家；放炮者只承担胡牌分
- `gangRefund=true` 时，流局的花猪或未听牌的仍在场玩家退回其曾收到的全部杠分给原付款人（退税）

**终局结算**（仅牌墙耗尽的流局执行；三家胡结束时不查花猪/大叫）：

1. `checkHuaZhu=true` 时查花猪：仍在场且手中同时含万、筒、条三门者为花猪；每位花猪向每位非花猪、仍在场玩家支付 `baseScore × 2^capFan`。花猪不参加查大叫，并按 `gangRefund` 退税
2. `gangRefund=true` 时退税：每位未听牌的仍在场非花猪玩家，退回其已收到的全部杠分给原付款人
3. `checkDaJiao=true` 时查大叫：每位未听牌的仍在场非花猪玩家，向每位听牌的仍在场非花猪玩家支付后者可点炮和牌的最高封顶分；不计自摸、杠上花、海底捞月等必须摸牌才能触发的操作番

听牌指存在至少一种牌面，使该玩家在不含定缺花色的前提下可点炮合法和牌；计算以完整牌集的牌面可能性为准，不受当前牌墙剩余实例限制。

## 5. 跨局规则

- **庄家轮换公式**（对应 `contracts/engine-contract.md` §4 的 `computeNextDealer` 契约）：当前不看上一局结果，顺时针轮转——和垃圾胡当前实现一样，但这是各自独立维护的实现，不是共享代码；血战规则定稿未提连庄，若未来要支持连庄/抢庄/叠倍，只改这里，不动契约签名或房间编排代码（`decisions.md` D15）。
- **会话排名**：当前复用房间层的通用实现（纯分数从高到低排序），见 `contracts/session-mechanics.md` §4 的现状说明与警示。

## 6. Config 清单

| 键                  | 标准值           | 备选                     |
| ------------------- | ---------------- | ------------------------ |
| `exchangeThree`     | true             | false                    |
| `capFan`            | 4（极中极）      | 3 / 5 / `null`（不封顶） |
| `multiWinOnDiscard` | true（一炮多响） | false（头跳）            |
| `robKong`           | true             | false                    |
| `checkHuaZhu`       | true             | false                    |
| `checkDaJiao`       | true             | false                    |
| `gangRefund`        | true             | false                    |
| `selfDrawBonus`     | 'addFan'         | 'addBase'（自摸加底）    |
| `mustHuOnLastFour`  | false            | true（成都比赛细则）     |

`checkHuaZhu=true` 时 `capFan` 必须为数字（花猪罚分取封顶分）；否则 config 非法。`mustHuOnLastFour=true` 时，牌墙剩余不多于 4 张且某家存在合法胡牌动作，该家必须选择胡牌，不能 `pass` 或继续出牌。地方差异一律通过本表达，不做成结构级 RuleSet 分叉（`decisions.md` D8）。

## 7. Phase、Action 与私有状态

- `BloodbattlePhase`：`exchanging → choosing-lack → playing ⇄ awaiting-claims → finished`（`exchangeThree=false` 时跳过 `exchanging`）
  - `exchanging`/`choosing-lack`：四家独立提交，全员提交后自动转移
  - `playing`：缺门出牌、碰/胡声明、多赢家、杠、抢杠胡、呼叫转移、三家胡/牌墙耗尽与流局终局结算
- `BloodbattleAction`（`packages/core/src/rulesets/bloodbattle/types.ts`）：前置阶段的 exchangeThree/chooseLack，playing 阶段动作与垃圾胡同构复用
- `BloodbattleState` 顶层可选字段（无独立 `variantState` 命名空间，`decisions.md` D12）：换三张阶段数据 `exchange?`、定缺选择 `lack?`、playing 阶段各家已胡标记与胡牌快照、基础杠分流水、补杠抢杠胡窗口、抢杠胡后的呼叫转移、流局查花猪/退税/查大叫

摸牌为引擎自动转移，不是玩家 Action，杠后补摸同理。

## 8. 事件清单（在垃圾胡公共事件基础上新增）

信封结构见 `contracts/engine-contract.md` §6；垃圾胡的基础 16 种事件本玩法同样具备（形状可能因玩法私有字段不同而略有差异，如 `HuDeclared`/`Settled` 见下），本节只列血战特有的新增事件：

| 事件                  | visibility     | payload 要点                                                                                          |
| --------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| ExchangeThreeSelected | seat（仅本人） | 选出的三张 TileId                                                                                     |
| ExchangeCompleted     | public         | 交换方向、阶段完成；不含任何 TileId                                                                   |
| TilesReceived         | seat（仅本人） | 收到的三张 TileId                                                                                     |
| LackChosen            | seat（仅本人） | 自己选择的花色                                                                                        |
| HuDeclared            | public         | 血战版额外携带公开牌面胡牌快照（TileKind）、`activeSeats`；内部快照仍从手牌容器接管 TileId            |
| Settled               | public         | `reason`、逐座位增减分；`reason` 为 `win`、`gang`、`gangTransfer`、`huaZhu`、`gangRefund` 或 `daJiao` |

`TileDiscarded`、`ClaimWindowOpened`、`PengMade` 等 public 事件只携带 `TileKind`，不得携带可由静态映射反查牌面的 TileId；私有 `TileDrawnPrivate`、选牌事件和内部状态仍可携带 TileId。

## 9. PlayerView 私有字段

血战 `PlayerView` 使用对外安全的 `TileKind` 形式表示副露/牌河（与垃圾胡用 `TileId` 不同，是两个玩法各自的选择，见 `contracts/engine-contract.md` §5）。每个公开 seat 额外携带：

- `status: "active" | "won"`
- TileKind 形式的副露/牌河
- 若已胡，公开 `winSnapshot`

仅本人的 view 额外带 TileId 形式的 `hand`、`myLackSuit`、本阶段是否已提交；其他座位的换三张与定缺选择不得泄漏。

## 10. 番型 fixture 约定（测试相关，配套 `testing-strategy.md`）

用例即测试 fixture，内联 TS 数组字面量（见 `packages/core/test/bloodbattle/scoring.test.ts`），字段：`id`/`desc`/`config`/`hand`/`melds`/`lack`/`win`/`context`/`expect`。约定：

- `expect.fanTypes` 为集合语义（顺序无关，重复项表多个根）；基础型即使贡献 0 番也不能省略
- 封顶用例须同时给出 `fan`（原始）与 `cappedAt`；`cappedAt` 只在触及封顶时出现
- 负例（`hu: false`）必须带机器可读 `reason`
- 每个番型至少：1 正例、1 边界例、1 与相邻番型的区分例
- 杠一律记入 `melds`，`hand` 里不出现裸的四张相同（七对/龙七对家族例外）
- 操作附加番默认可叠加，只有基础型互斥；杠上花本质是自摸，`selfDrawBonus='addFan'` 时与 `zimo` 同时计入

## 11. 状态

v2 定稿，阶段 1.5 已实现；番型 fixture 20 条、core 测试 57 条通过；多配置 10000 局 fuzz 通过。相关决策：D8（配置边界）、D9（作为第二个玩法矫正 RuleSet 抽象）、D12（接口调整）。
