# 血战 playing 阶段实施方案

> 状态：已按本方案的 Stage A/B/C 实施，当前进入阶段 1.5 验收审计；审计完成后按 doc-map 惯例删除本文件，并保留结论于 `docs/plan.md`/`docs/rules-bloodbattle.md`/`docs/core-types-and-events.md`。

## Context

D12（core 结构反转）已完成并合并到 main：`packages/core/src` 现在是 `lib/` + `rulesets/junk/`（完整实现）+ `rulesets/bloodbattle/`（只有前置阶段 `applyExchangeThree`/`applyChooseLack` 和纯算番函数 `scoreBloodbattleHand`）。`docs/plan.md` 的"下一步第一个动作"指向血战 `playing` 阶段（出牌/吃碰杠/胡牌/声明窗口/结算/终局），这是阶段 1.5 验收前最后一块空白，体量预计超过当初 junk 的完整实现（因为血战有 junk 没有的杠分即时结算、呼叫转移、终局查花猪查大叫三个子系统）。

动手前，先确认了 4 个未回答的架构问题（`docs/plan.md` 开放问题 #1/#2/#3/#4/#6）：

1. `WinEvaluation`/`Settlement` 不做成正式接口——D12 已删除旧 `RuleSet` 8 方法接口（含这两个类型），胡牌判定/算分是普通内部函数，不用挂类型契约。
2. `GameResult`/结算模型：`BloodbattleState` 新增运行时累计字段 `scores: [number,number,number,number]`，每次结算（杠/胡/退税/查花猪/查大叫）直接更新它并各自发一条带自己 `scoreDeltas` 的 `Settled` 事件；终局 `result` 只存元数据，不汇总成一个 scoreDeltas。
3. 多赢家 active/won 语义：`BloodbattleState` 新增显式字段 `status?: Partial<Record<SeatId,"active"|"won">>`。
4. 不抽共享声明窗口裁决器：血战 playing 阶段的声明窗口和 junk 的 `pendingClaims` 结构相似，但只是模式的第 2 个实例，未到"重复三次再提炼"的阈值，照抄 junk `claims.ts` 独立实现。
5. config 解析边界：照抄 junk 已验证的模式，新建 `rulesets/bloodbattle/config.ts`。

以上已确定，不再讨论。规则细节层面还有 7 处文档没写清楚的模糊地带（呼叫转移多赢家归属、花猪 baseScore 取值等），已按 `decisions.md` **BB2** 先例（"用户不熟悉血战细则，授权按通用实现处理，非项目方逐条确认"）直接采纳方案里的合理默认值，作为**假设**写入下面 §7，不逐条确认。

## 1. 类型草图（`rulesets/bloodbattle/types.ts`）

```ts
export type BloodbattlePhase =
  "exchanging" | "choosing-lack" | "playing" | "awaiting-claims" | "finished";

export type BloodbattleConfig = GameConfig & {
  rulesetId: "bloodbattle";
  exchangeThree: boolean;
  capFan: number | null; // 默认 4；null = 不封顶
  multiWinOnDiscard: boolean; // true = 一炮多响；false = 头跳
  robKong: boolean; // true = 补杠开抢杠胡窗口
  checkHuaZhu: boolean;
  checkDaJiao: boolean;
  gangRefund: boolean;
  selfDrawBonus: "addFan" | "addBase";
  mustHuOnLastFour: boolean;
};

// 无吃
export type BloodbattleAction =
  | { type: "exchangeThree"; tiles: [TileId, TileId, TileId] }
  | { type: "chooseLack"; suit: "m" | "p" | "s" }
  | { type: "discard"; tile: TileId }
  | { type: "anGang"; kind: TileKind }
  | { type: "buGang"; tile: TileId }
  | { type: "peng" } // 声明窗口
  | { type: "minGang" } // 声明窗口（直杠/明杠）
  | { type: "zimo" } // 自己回合：普通自摸 + 杠上花
  | { type: "hu" } // 声明窗口：点炮 + 抢杠胡
  | { type: "pass" };

export type BloodbattleClaimAction = Extract<
  BloodbattleAction,
  { type: "peng" | "minGang" | "hu" }
>;
export type BloodbattleClaimOption = { action: BloodbattleClaimAction };

export type BloodbattlePendingClaims = {
  discard: { seat: SeatId; tile: TileId };
  source?: "discard" | "robKong";
  options: Partial<Record<SeatId, BloodbattleClaimOption[]>>;
  responses: Partial<Record<SeatId, BloodbattleAction>>;
  context: { afterKong: boolean; isLastTile: boolean }; // 开窗时快照，避免依赖可变的 state.turnFlags
};

export type BloodbattleWinSnapshot = {
  hand: TileId[]; // 胡牌瞬间的暗牌；zimo/kongFlower 含 winTile，discard/robKong 不含（该牌仍归原容器）
  winTile: TileId; // 仅作展示/算分指针
  lack: "m" | "p" | "s";
};

export type BloodbattleGangPayment = {
  gangEventId: number;
  opener: SeatId;
  payer: SeatId;
  amount: number;
  refunded?: boolean;
  transferred?: boolean;
};

export type BloodbattleGameResult = {
  winners: SeatId[];
  endReason: "allWin" | "wallExhausted";
  huaZhu?: SeatId[];
  tingpai?: SeatId[];
  notTingpai?: SeatId[];
};

export type BloodbattleState = {
  config: BloodbattleConfig;
  phase: BloodbattlePhase;
  wall: TileId[];
  seats: SeatState[];
  currentSeat: SeatId;
  seq: number;
  prng: PrngState;
  scores: [number, number, number, number]; // 累计分数
  status?: Partial<Record<SeatId, "active" | "won">>; // 缺省视为 active
  wins?: Partial<Record<SeatId, BloodbattleWinSnapshot>>;
  lastDiscard?: { seat: SeatId; tile: TileId };
  pendingClaims?: BloodbattlePendingClaims;
  turnFlags?: { afterKong: boolean; isLastTile: boolean }; // 每次摸牌设置
  gangPayments: BloodbattleGangPayment[]; // 只追加的账本
  lastGangEventId?: number; // "武装"中的呼叫转移窗口，消费后清空
  exchange?: { selections: Partial<Record<SeatId, [TileId, TileId, TileId]>> };
  lack?: Partial<Record<SeatId, "m" | "p" | "s">>;
  result?: BloodbattleGameResult;
};

export type BloodbattlePlayerView = Omit<PlayerViewBase, "seats"> & {
  phase: BloodbattlePhase;
  seats: Array<
    PlayerViewBase["seats"][number] & {
      status: "active" | "won";
      winSnapshot?: { hand: TileId[]; winTile: TileId; melds: Meld[] };
    }
  >;
  scores: [number, number, number, number];
  myLackSuit?: "m" | "p" | "s";
  myExchangeSubmitted?: boolean;
  myLackSubmitted?: boolean;
  myClaimOptions?: BloodbattleClaimOption[];
  myClaimResponse?: BloodbattleAction;
  lastDiscard?: { seat: SeatId; tile: TileId };
  result?: BloodbattleGameResult;
};
```

**事件 payload 设计**（`docs/core-types-and-events.md` 原文只写"完整胡牌快照""activeSeats""reason+逐座位增减分"，没给具体字段名，需要设计——下面是本方案的设计，Stage A 落地后应回写进该文档）：

```ts
// HuDeclared（public）
{
  type: "HuDeclared", seat, winType: "zimo" | "ron" | "kongFlower" | "robKong",
  from?: SeatId,
  snapshot: { hand: TileId[], winTile: TileId, melds: Meld[], lack: "m"|"p"|"s" },
  scoring: { fanTypes: string[], fan: number, multiplier: number, cappedAt?: number },
  activeSeats: SeatId[], // 本事件生效后 status !== "won" 的座位
}

// Settled（public）
{
  type: "Settled",
  reason: "win" | "gang" | "gangTransfer" | "huaZhu" | "gangRefund" | "daJiao",
  scoreDeltas: [number, number, number, number],
  detail?: { ... reason 各自的座位明细，审计/UI 用，非强制字段 }
}
```

## 2. `config.ts`

```ts
export const DEFAULT_BLOODBATTLE_CONFIG: BloodbattleConfig = {
  rulesetId: "bloodbattle",
  exchangeThree: true,
  capFan: 4,
  multiWinOnDiscard: true,
  robKong: true,
  checkHuaZhu: true,
  checkDaJiao: true,
  gangRefund: true,
  selfDrawBonus: "addFan",
  mustHuOnLastFour: false,
};
```

九个默认值均取自 `docs/rules-bloodbattle.md` §6 config 表的"标准值"列，无歧义。`parseBloodbattleConfig(input)` 照抄 `parseJunkConfig` 的字段校验模式，额外加一条跨字段规则（文档明文写的）：`checkHuaZhu === true` 时 `capFan` 必须是 `number`（非 `null`），否则 `{ error: { code: "HUAZHU_REQUIRES_CAP_FAN" } }`。`prelude.ts` 里 `createBloodbattlePrelude` 目前手写内联解析 `exchangeThree`（`configObject.exchangeThree !== false`），要改成调用 `parseBloodbattleConfig`，一并关闭 `plan.md` 开放问题 #6。

`"standard"` 别名不是运行时 `createGame` 的输入，是规则文档 YAML fixture 里的约定，属于未来测试 fixture loader 的事；近期具体动作是把 `bloodbattle-scoring.test.ts` 里临时手写的 `const standard = { capFan: 4, selfDrawBonus: "addFan" }` 换成从 `config.ts` 导入 `DEFAULT_BLOODBATTLE_CONFIG` 的子集，让"标准配置是什么"只有一个来源。

## 3. 文件划分

```
rulesets/bloodbattle/
  types.ts        （按 §1 扩展）
  config.ts        新增
  state-machine.ts 新增 —— seats/nextSeat/cloneState/appendEvent/fail/configOf、
                    removeTiles、isWin（包一层 scoreBloodbattleHand）、
                    emitDraw/beginTurn（设置 turnFlags）、杠分结算辅助函数、
                    applyDiscard/applyPeng/applyMinGang/applyAnGang/applyBuGang/
                    applyZimo、finishWin 系列、createBloodbattleGame
                    （吸收现有 prelude 里重复手写的 cloneState/appendEvent/fail/seats）
  prelude.ts       保留，但 applyExchangeThree/applyChooseLack 改为从
                    state-machine.ts 导入公共辅助函数，不再各自重复声明
  claims.ts        新增 —— priority（胡>杠>碰，无吃）、distanceFromDiscarder、
                    chooseClaims（multiWinOnDiscard 真假分支）、
                    resolveClaimWindow、applyClaimResponse、robKong 接入
  settlement.ts    新增 —— 终局三步骤（查花猪→退税→查大叫）+ finalizeGame
                    编排（三家胡/流局两个入口都调它）
  tingpai.ts       新增 —— isTingpai/bestRonMultiplier（见 §4）
  scoring.ts       不动
  view.ts          新增 —— getPlayerView + rebuildPlayerView
  index.ts         扩展 —— 组装 RulesetModule，注册进 engine.ts
  fuzz.ts          Stage C 新增 —— 仿 junk fuzz.ts
```

## 4. 听牌（tingpai）算法设计

关键洞察：`scoreBloodbattleHand`（已实现、已测试）本来就是"手牌+候选牌能否合法胡"的判定器，且操作对象是 `TileKind` 不是 `TileId`，天然"不受当前牌墙剩余实例限制"——只需要自己枚举候选花色种类，不用去看牌墙里还剩什么。

```ts
// rulesets/bloodbattle/tingpai.ts
const ALL_RANK_KINDS = (excludeSuit: "m" | "p" | "s"): TileKind[] => ...; // 除缺门外两门 1-9

export const ronCandidates = (hand, melds, lack) =>
  ALL_RANK_KINDS(lack)
    .map((tile) =>
      scoreBloodbattleHand({
        config: { capFan: null, selfDrawBonus: "addFan" },
        hand,
        melds,
        lack,
        win: { tile, by: "discard" },
      }),
    )
    .filter((r) => r.hu);

export const isTingpai = (hand, melds, lack): boolean => ronCandidates(hand, melds, lack).length > 0;

// 查大叫用："后者可点炮和牌的最高封顶分"
export const bestRonMultiplier = (hand, melds, lack, config): number | undefined => {
  const results = ronCandidates(hand, melds, lack); // 假设条件见 §7-5
  return results.length ? Math.max(...results.map((r) => r.multiplier)) : undefined;
};
```

刻意留在 `rulesets/bloodbattle/` 私有，不推去 `lib/win.ts`：`lib/win.ts` 是无立场的形状判定器，不认识缺门/副露算番/血战番型族；直接复用 `scoreBloodbattleHand` 避免重复实现形状判定逻辑，且不碰 `scoring.ts`。状态机调用方在传入前自己用 `BLOODBATTLE_TILE_SET.kindOf` 做 TileId→TileKind 转换，遵循 `scoring.ts` 已经确立的边界约定。

## 5. 呼叫转移（call transfer）状态设计

退税规则要求精确退回"曾收到的全部杠分给原付款人"，不是净额，所以需要账本而非单一累计数：

`gangPayments: BloodbattleGangPayment[]`（`{gangEventId, opener, payer, amount, refunded?, transferred?}`）+ `lastGangEventId?: number`（"武装中"的窗口标记）。

**每次杠结算**（暗杠/补杠转正/被碰杠claim）：按付款人各追加一行账本，分配新 `gangEventId`，`state.lastGangEventId = 该id`，然后走补摸（`beginTurn(..., replacement:true)`），同时设置 `turnFlags = { afterKong:true, isLastTile: 补摸后牌墙是否耗尽 }`。

**各杠型付款金额**（文档"刮风下雨"）：`minGang`（被碰的直杠）——仅弃牌者付 2，一行账本；`buGang`——其余在场每家各付 1，最多 3 行；`anGang`——其余在场每家各付 2，最多 3 行。

**窗口消费的三种结局**（各自清空 `lastGangEventId`）：

1. 开杠者补摸后紧接着又杠：新 `gangEventId` 覆盖旧的，旧账本行不转移（本来就没进入过声明窗口，正确）。
2. 开杠者补摸后出牌，声明窗口无人胡（无人应或被碰/杠抢）：账本行永久生效，不发转移事件。
3. 开杠者补摸后出牌，声明窗口被胡（`discard.seat === lastGangEventId 对应的 opener`）：即杠上炮——把 `gangEventId === lastGangEventId` 的所有行标记 `transferred:true`，发一条 `Settled(reason:"gangTransfer")` 把这些行的金额之和从 `opener` 转给赢家。放炮者本身只按正常 `Settled(reason:"win")` 付胡牌分，不额外承担杠分（转移是"开杠者已收的钱转走"，不是"放炮者被多收一笔"）。

**开杠者自己杠上花自摸**：不需要转移——开杠者同时是收款人和赢家，账本上已经是自己的，`finishWin` 时照常清空 `lastGangEventId`。

**终局退税**（`gangRefund=true`，终局步骤②）：对每个在场、非花猪、未听牌的座位 X，找出 `payer===X && !refunded && !transferred` 的所有行，按 `opener` 汇总退回，标记 `refunded:true`。整个步骤发一条聚合 `Settled(reason:"gangRefund")` 事件（理由见 §7-6）。

## 6. 分阶段执行步骤（供后续实现时使用，本轮不执行）

体量上比 junk 整个回合循环还大，外加三个 junk 没有的子系统（杠分账本、呼叫转移、终局三步结算），建议拆 **三个独立可合并的 commit**，每步都让 `getLegalActions` 保持诚实（未实现的动作类型永不提供，`cross-ruleset-invariants.test.ts` 的参数化遍历不会意外跑到未完成代码路径）。

**Stage A —— 回合循环、声明窗口、多赢家延续，不含杠**

- 改动：`types.ts`（`BloodbattleAction`/`BloodbattlePendingClaims`/状态字段，`gangPayments`/`lastGangEventId` 先留空结构）、`config.ts`（新）、`state-machine.ts`（新，含 `applyDiscard`/`applyZimo`/`emitDraw`/`beginTurn`/多赢家 `status`/`wins` 记账/`finishWin`/`finishMultiRon`）、`claims.ts`（新，胡+碰优先级+`multiWinOnDiscard` 真假分支，不含 robKong）、`settlement.ts`（新，只做"三家胡立即结束"和"流局跑查花猪+查大叫、杠分账本恒空"两条路径）、`tingpai.ts`（新，`checkDaJiao` 这阶段就需要）、`view.ts`（新）、`index.ts`+`engine.ts`+`test/support/registered-rulesets.ts`（注册血战）。
- 刻意排除：`anGang`/`buGang`/被碰杠的 `minGang`/抢杠 `hu`、呼叫转移、`mustHuOnLastFour`。
- 新增测试：`bloodbattle-playing.test.ts`（缺门强制出牌、声明优先级、`multiWinOnDiscard=true/false` 两种结算、胡家离场后不再参与后续、三家胡立即结束不查花猪大叫、流局零杠场景下查花猪+查大叫）；把血战加进 `REGISTERED_RULESETS_FOR_TESTING`，`cross-ruleset-invariants.test.ts` 自动覆盖。
- 验证：`assertTileConservation` 搭配 `extraTiles` 钩子覆盖 `wins` 快照容器（`winTile` 不重复计入，见类型注释）。

**Stage B —— 杠机制**

- 改动：`state-machine.ts`（`applyAnGang`/`applyBuGang`/被碰的 `minGang`/杠分结算/账本/`turnFlags.afterKong`/`kongFlower` 胡牌路径）、`claims.ts`（`config.robKong` 时补杠开抢杠胡窗口）、`settlement.ts`（退税步骤真正有行可退）、`mustHuOnLastFour` 强制。
- 新增测试：`bloodbattle-gangs.test.ts`（三种杠型付款金额、呼叫转移、抢杠胡不计根不计杠分、`mustHuOnLastFour` 强制、退税精确对应付款人不是净额、"手里有缺门牌时张数够也不提供碰/杠"这个 `scoring.ts` 的 `LACK_SUIT_PRESENT` 检查覆盖不到的场景需要 `claims.ts` 自己单独拦）。

**Stage C —— 硬化、fuzz、文档回写**

- 改动：`fuzz.ts`（新，仿 junk，遍历 8 个 config 开关组合，`exchangeThree` 固定 true 因为已被 `bloodbattle-phases.test.ts` 覆盖）、`docs/rules-bloodbattle.md`/`docs/plan.md`/`docs/core-types-and-events.md` 回写（阶段 1.5 checkbox、6 个开放问题标记已答、`HuDeclared`/`Settled` payload 定稿）。
- 新增测试：`bloodbattle-fuzz.test.ts`（先保守 200-1000 局，状态空间比 junk 大得多）+ 几个手工构造的"刁钻"fixture（杠上炮弃牌被多家同时胡、全缺门手牌卡在定缺边界、`checkHuaZhu=true` 真花猪、`capFan:null`+`checkHuaZhu:true` 必须被 `parseBloodbattleConfig` 拒绝）。

**为什么不从 Stage A 就上 fuzz**：血战的动作空间受缺门约束和阶段局部合法性门控（`getLegalActions` 已经保证正确性），"挑第一个/随机一个合法动作"走随机游走本身在 Stage A 也是安全的——真正推迟到 Stage C 的是"搭建参数化 `fuzz.ts` 模块、扫 8 个 config 开关"这件事本身，因为杠还没实现时做这个会造成假的信心（大片状态机代码没被测到），`mustHuOnLastFour`/抢杠也没实现时得反过来临时禁用这些开关。"整局能不能跑完"这个便宜版本 Stage A 就免费拥有（`cross-ruleset-invariants.test.ts` 已有的"挑 `getLegalActions(state,seat)[0]` 走 30 步"遍历逻辑），叠加 tile-conservation 断言即可。

## 7. 假设清单（按 BB2 先例采纳，不逐条确认；如后续发现偏差可随时调整）

1. `HuDeclared`/`Settled` payload 字段名是本方案的设计产物，不是文档明文规定——已在 §1 给出具体形状，Stage A 落地后应回写进 `core-types-and-events.md`。
2. 呼叫转移遇到多家同时胡该杠上炮弃牌时，只有 `winners[0]`（按 `distanceFromDiscarder` 排序后最高优先级）收到转移的杠分，不做均分/多份复制。
3. 花猪公式 `baseScore × 2^capFan` 里的 `baseScore` 假设是硬编码字面量 `1`（config 里没有这个字段，`scoring.ts` 的 `multiplier` 已是最终分值）；如果未来要做成可配置桌费，需要新增 config 字段。
4. `multiWinOnDiscard=false`（头跳）的同优先级多家胡裁决，假设复用文档 §2 已写的"从出牌者下一家起按行牌方向"距离裁决（同 junk `multiHuPolicy:"headJump"` 的写法），不是按番值裁决。
5. 查大叫"不计自摸/杠上花/海底捞月等操作番"，假设为：假设点炮场景下不附加 `afterKong`/`isLastTile` 上下文（最保守读法，不假设有利的偶然情境）；"等" 是否也排除杠上炮/海底炮（点炮触发的操作番）按同一保守原则一并排除。
6. 杠分相关结算（转移/退税）按"结算步骤"而非"逐座位收付对"发 `Settled` 事件粒度（即整个退税步骤一条事件，`scoreDeltas` 是 4 元素数组），依据是架构决策 #2 的措辞"每次结算...各自发一条...Settled 事件"。
7. 缺门约束（"出牌只能出缺门牌，且不得碰/杠/胡"）同样适用于玩家自己主动声明的 `anGang`/`buGang`/`zimo`，不只是声明窗口里对他人弃牌的响应——按文档句子结构的自然读法。

## Critical Files（供 Stage A 实现时参考）

- `packages/core/src/rulesets/bloodbattle/{types,prelude,scoring,index}.ts`
- `packages/core/src/rulesets/junk/{state-machine,claims,view,config,index,fuzz}.ts`（作为可复制模式，不共享代码）
- `packages/core/src/lib/invariants.ts`（`ExtraTiles<S>` 钩子，胡牌快照容器要用它纳入守恒检查）
- `packages/core/src/engine.ts`（`RulesetModule<TState,TAction>` 契约、注册表）
- `packages/core/test/support/registered-rulesets.ts`
- `docs/rules-bloodbattle.md`、`docs/core-types-and-events.md`（Stage C 回写）
