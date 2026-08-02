# core package 整理建议（2026-08-02 topdown review）

> 本文件是一次性审查产出的**改进清单**，不是长期文档，不纳入 `docs/doc-map.md` 的分类体系。
> 执行完对应条目后，把该条目从本文件删除或标记完成；全部清理完毕后本文件应删除。
> 本文件保留为一次性审计清单。2026-08-02 已实施其中的 A1-A3、A5、C2，以及 D 的包级中文注释规则；其余条目尚待处理，后续状态以 `codex-suggestions.md` 为准。

## 背景

按用户要求对 `packages/core` 做 topdown review，覆盖：注释归属、文件/目录结构、魔术字、重复定义。
范围：`src/lib/*`、`src/{engine,errors,events,types,cli,index}.ts`、`src/support/registered-rulesets.ts`，
以及三个 ruleset（junk/hangzhou/bloodbattle）的 `constants.ts`/`state-machine.ts`/`claims.ts`/`config.ts`/`scoring.ts`/`hand.ts`。

用户已确认：**注释语言统一为中文**（覆盖全局 `~/.claude/CLAUDE.md` 的"注释用英文"默认规则，
需要在 `packages/core/AGENTS.md` 里补一条例外说明，避免下次审查再次冲突）。

本文件已与另一份独立审查 `codex-suggestions.md` 交叉核对，合并了其中经验证属实的条目
（registry 重复注册、`lib/win.ts` 命名与适用范围、`cli.ts` 定位、注释里点名引用 `plan.md` 的风险），
略去了未验证或改动范围过大的部分（如按职责拆分 500+ 行的 `state-machine.ts`/`view.ts`，只作为低优先级讨论项保留）。

## 非目标

- 不抽取跨玩法的状态机、声明优先级、胡牌、计分、结算或庄家轮换公式——三个 ruleset 的规则分支本就该保持独立。
- 不改变 engine 的时间、可见性、身份、TileId 或 ack 契约。
- 不以"消灭所有字面量"为目标；玩法规则内部的局部数字和判别字符串按可读性判断，不强行常量化。
- 不把内容写进 `CLAUDE.md`；`docs/doc-map.md` 已规定该文件只是指向同目录 `AGENTS.md` 的兼容入口。

---

## A. 结构性代码问题（建议直接修）

### A1. seat 常量三处重复定义，两处是死代码

- `src/lib/ids.ts:1` `SEATS = [0,1,2,3]`（只用来派生 `SeatId` 类型，自身未被外部引用）
- `src/lib/constants.ts:4-5` `SEAT_IDS = [0,1,2,3]` + `SEAT_COUNT`（定义后**全仓库零处使用**）
- `src/rulesets/bloodbattle/constants.ts:4` `BLOODBATTLE_SEATS = [0,1,2,3]`（唯一被实际使用的一份：
  `bloodbattle/prelude.ts`、`state-machine.ts`、`settlement.ts`）
- 另有 ~20 处内联字面量 `[0, 1, 2, 3] as SeatId[]`，分布在：
  `junk/state-machine.ts:274,418,483,535,538`、`junk/fuzz.ts:27`、
  `hangzhou/state-machine.ts:273,405,504,507`、`hangzhou/fuzz.ts:27`、
  `bloodbattle/prelude.ts:91,94,137,142,146,182`、`bloodbattle/prelude.test.ts:80,93,110`

**建议**：只保留一份公共来源（建议留在 `lib/ids.ts`，因为 `SeatId` 类型本来就从这里派生；
删除 `lib/constants.ts` 或把它合并进 `ids.ts`），删掉 `lib/constants.ts` 里未使用的 `SEAT_IDS`/`SEAT_COUNT`，
三个 ruleset 的内联字面量与 `BLOODBATTLE_SEATS` 全部改为引用这一份公共常量。

### A2. seat 轮转逻辑重复

- `nextSeat = (seat) => ((seat + 1) % 4) as SeatId`：`junk/state-machine.ts:27` 与
  `hangzhou/state-machine.ts:25` 完全相同实现。
- `(seat - discarder + 4) % 4`（座位相对距离）：`junk/claims.ts:28` 与 `hangzhou/claims.ts:28` 完全相同。
- bloodbattle 有自己的方向版本（`prelude.ts:60-61` 按"上/对/下家"三个方向），逻辑不同，不参与合并。

**建议**：把 `nextSeat` 和"相对距离"两个纯函数下沉到 `lib/seat.ts`（或新建 `lib/seat-math.ts`），
junk 和 hangzhou 改为引用；bloodbattle 的方向版本保持不变（语义不同，不是重复）。

### A3. `"INVALID_CONFIG"` 魔术字重复 7 次

`errors.ts` 已定义 `CORE_ERROR_CODES.invalidConfig = "INVALID_CONFIG"`，但三个 ruleset 的
`config.ts` 都各自手写字符串字面量而不是引用它：
`junk/config.ts:16,25`、`hangzhou/config.ts:20,37`、`bloodbattle/config.ts:19,23,25,36`。

**建议**：三处全部替换为 `CORE_ERROR_CODES.invalidConfig`。

### A4. `"UNKNOWN_ACTION"` 魔术字重复 3 次、无统一来源

`junk/index.ts:92`、`hangzhou/index.ts:108`、`bloodbattle/state-machine.ts:585` 各自手写相同字符串。
不确定是否要提升到 `CORE_ERROR_CODES`（语义上更像 ruleset 内部 catch-all），
**先记录为讨论项，不强制并入 errors.ts**；但三处应保持字符串完全一致（目前恰好一致，属于运气，
建议至少抽一个 ruleset 内部共享的字面量类型/常量，防止未来打错字）。

更通用的方案：每个 ruleset 给自己能返回给调用方的 `RuleViolation.code` 建立一个受约束的字面量联合类型
（而不是任意 `string`），这样 `UNKNOWN_ACTION` 这类跨玩法共用的判别串至少能在类型层面防拼写漂移，
不需要强行把它们提升成运行时常量。如果这个错误码后续会被 protocol/server 消费，需要先和对应契约、测试同步。

### A5. `events.ts:75` 类型不一致

`seat as 0 | 1 | 2 | 3` 是全仓库唯一一处直接写字面量联合类型而不是 `SeatId` 的地方，风格与其余代码不一致。

**建议**：改成 `seat as SeatId`（需要从 `./lib/ids.ts` import `SeatId`）。

### A6. `Number(seat) as SeatId` 模式重复

`hangzhou/claims.ts:37,108` 与 `junk/claims.ts:36,106` 完全相同：把 `Record<SeatId, T>` 的 key
（被 JS 隐式转成 string）转回 `Number(...) as SeatId`。

**建议**：讨论是否值得下沉一个 `lib/` 辅助函数（如 `seatKeysOf<T>(record): SeatId[]`）；
工作量小、收益一般，优先级低于 A1-A3。

### A7. ruleset registry 手写了两份，新增玩法必须同步改

- `src/engine.ts:45-49` 的 `rulesets: Record<string, RulesetModule<any, any, any>>`（运行时唯一权威 dispatch 表）
- `src/support/registered-rulesets.ts:22-95` 的 `REGISTERED_RULESETS_FOR_TESTING`（跨玩法不变量测试专用列表）

两份都手写了完全相同的 `{ junk, bloodbattle, hangzhou }` 三项，新增第四个 ruleset 时必须记得同步改两处，
漏改不会有类型报错——`support/` 那份只是"忘了注册新玩法进跨玩法测试"，容易被忽略。

**建议**：让 `support/registered-rulesets.ts` 从 `engine.ts` 的 `rulesets` 表派生（或者反过来把
一个唯一的 registry 提升为公共模块，两处都消费它），而不是各自手写字面量对象。
这个改动会触及 `engine.ts` 的 dispatch 结构，建议单独一次提交、跑一遍完整 `verify` 后再合并，
不与 A1-A6 混在一起改。

---

## B. 文件/目录结构建议

### B1. `lib/ids.ts` 与 `lib/constants.ts` 语义重叠

见 A1。合并方案二选一：

- 方案一：`ids.ts` 只保留类型（`SeatId`/`TileId`/`TileKind`），可执行常量都放 `constants.ts`；
- 方案二（推荐，文件都很小）：直接删除 `constants.ts`，内容并入 `ids.ts`。

### B2. 文件头部职责说明——建议不加

不建议在每个文件开头加"本文件职责是……"的描述性 banner。理由：

- `packages/core/AGENTS.md` 已有"代码地图"一节集中维护文件职责，文件头再复述会形成第二个真相源，
  小文件尤其容易在改动时忘记同步。
- 现有真正有价值的注释都是"为什么"（如 `invariants.ts` 的 tombstone 说明），这类注释理应留在紧邻代码处。
- 如果冷启动定位文件慢是核心诉求，更好的路径是把"代码地图"写得更细（比如专门提一句
  `lib/constants.ts` 和 `lib/ids.ts` 如何分工），而不是给每个文件加头部注释。

### B3. `rulesets/*/constants.ts` 三份结构对称——不算问题

三个 ruleset 各自的 `PHASES`/`SEATS`/`TILE_SET` 常量文件模式一致，这是"每个 ruleset 自己的立场常量"，
符合 AGENTS.md"`lib/` 只放不带玩法立场的纯函数积木"的铁律，定位清楚，不需要改。

### B4. `lib/seat.ts` 命名与实际内容不符

文件实际导出的是 `Meld`/`DiscardEntry`/`SeatState`——即"一个座位手里的牌局状态"，
不是"座位是什么"（那是 `ids.ts` 里 `SeatId` 的职责）。命名容易让人误以为这里放座位轮转之类的通用工具
（实际上 A2 建议下沉的 `nextSeat`/`seatDistance` 更适合放在这里，或者这个文件改名）。

**建议**：改名为 `seat-state.ts` 或 `player-state.ts`，与 `ids.ts`（座位是什么）、
新建的座位数学工具（座位怎么算，见 A2）三者职责分开、命名对应。

### B5. `lib/win.ts` 不是通用算法，命名/文档应体现这一点

虽然函数签名接受任意 `TileSet`，但 `isSuit`（`win.ts:4-5`）硬编码判断花色后缀是 `m`/`p`/`s`，
胡牌形状固定为"四组面子+一对"和"七对"——这是标准中国麻将的规则前提，不是跟 `TileSet` 参数一样可以自由替换的。
hangzhou 的癞子版本（`hand.ts`）和 bloodbattle 的按花色版本（`scoring.ts`）都没有复用它，也印证了它本质上是
"标准玩法专用"而非"任意 TileSet 通用"。

**建议**：改名为 `standard-hand.ts`（更准确反映"标准无癞子胡牌判断"），或者至少在文件顶部加一句说明
"假设标准中国麻将花色编码（m/p/s/z）与四组面子+一对/七对规则，不是通用 TileSet 算法"，避免未来有人
想当然地把它当成万能积木来复用。工作量小，但涉及改名会影响 `index.ts` 的导出面，建议和 B1 一起做。

---

## C. 讨论项（不建议现在动，先记录）

### C1. 三份独立实现的"能否拼出 N 组面子+将牌"回溯算法

- `lib/win.ts` 的 `canFormMelds`（标准无癞子，基于 TileSet/TileId）
- `hangzhou/hand.ts` 的 `canComplete`（带癞子/万能牌预算）
- `bloodbattle/scoring.ts` 的 `canDecomposeSuit`（按花色 rank-count 数组，不用 TileId/TileSet 间接层）

三处代码都已经用注释解释了"为什么不复用 `win.ts`"，理由站得住脚（癞子替代逻辑 / 不需要 TileId 间接层），
**不建议强行合并**。建议仅在 `lib/win.ts` 顶部加一句指引，提示未来新增 ruleset 时先看这两个兄弟实现，
评估能否复用回溯骨架，避免出现第四份。

### C2. `events.ts` 里混入了 bloodbattle 专有事件常量

`EVENT_TYPES`（`events.ts:4-27`）本应是"跨玩法共享的事件信封"，但 `exchangeThreeSelected`/`tilesReceived`/
`exchangeCompleted`/`lackChosen` 四项明确标了注释"bloodbattle-only ... no other ruleset emits these"，
混在公共文件里。`EventType` 目前也不能表达"某玩法能发哪些事件"这种约束，实际约束靠各玩法自己的 payload 联合类型兜底。

这是架构层面的问题（涉及事件登记是否要做成跨包稳定契约），按 AGENTS.md 护栏"架构级问题不自行决定，
标 TODO 提回 Claude Project"，**本文件只记录、不建议直接改**。需要先回答一个前置问题：`EventType` 是否
真的需要作为跨包稳定枚举？如果是，应由 protocol/contract 明确版本与兼容策略；如果不是，可以把玩法专有事件
名迁回各自 `rulesets/<id>/`。

### C3. 部分文件偏大，按职责拆分是可选项

三个 `state-machine.ts`（538-654 行）、三个 `view.ts` 同时承担"实时状态投影"和"事件重放投影"两种职责。
junk 与 hangzhou 结构高度同构，但已经存在足以阻止共享状态机的规则差异（不建议抽共享状态机，违反上面的"非目标"）。

**建议**：不是当前优先级，仅记录为可选重构方向——如果未来某个文件继续膨胀，优先拆 `view.ts` 为
"实时投影"和"重放投影"两个文件（职责边界最清晰），而不是拆 `state-machine.ts`。

### C4. `src/cli.ts` 目前只支持 junk，根目录位置暗示的"通用能力"名不副实

`cli.ts` 只 import 了 `rulesets/junk/*`（`cli.ts:1,3`），但它位于 `src/` 根目录，容易让人以为是三个玩法通用的 CLI。

**建议**：如果短期内不打算做成 `--ruleset` 通用 CLI，改名或迁移到 `rulesets/junk/cli.ts` 更诚实；
如果计划做成通用 CLI，才保留在根目录，但需要补上 ruleset 选择参数。优先级低，不影响正确性。

---

## D. 注释语言统一（用户已确认：全部改中文）

- 需要英译中的文件（含 JSDoc/行内注释）：
  `lib/omniscient.ts`（整段 JSDoc）、`lib/win.ts`（多处 witness 版本说明）、`engine.ts`（`RulesetModule` 相关 JSDoc）、
  以及其余 `rulesets/*` 下英文注释（需要通读一遍逐条确认，未逐一列出）。
- 需要在 `packages/core/AGENTS.md` 增补一条：本包注释统一使用中文，覆盖全局 CLAUDE.md 默认的英文注释规则。

### D1. 4 处注释里点名引用了 `docs/process/plan.md` 的具体条目

- `hangzhou/hand.ts:106`
- `junk/types.ts:61`
- `hangzhou/types.ts:74`
- `junk/state-machine.ts:97`

按 `docs/doc-map.md` 的规则，`plan.md` 是"过程性文档，持续清理"，专题完成后只保留一行完成摘要，
原始条目会被删除。代码注释里点名引用这些条目（如"胡牌结算展示最终赢牌组合"）一旦对应条目被清理，
注释就变成指向不存在内容的死链接，读者无从查证。

**建议**：翻译成中文的同时，把这几处改成直接内嵌关键结论本身（比如"最终赢牌快照包含胡牌时刻实际用到的
面子拆解，用于结算展示"），不再点名引用 `plan.md` 的具体条目名；如果结论足够稳定、值得长期查证，
应该分流进 `docs/variants/<id>.md`（按 doc-map 的"专题收尾清单"第 1 条）而不是留在代码注释里点名过程文档。

---

## E. 尚待决定的问题（需要用户/Claude Project 拍板，不是实现细节）

1. `EventType`（`events.ts`）是否真的需要作为跨包稳定枚举？决定了 C2 的处理方向——保留则需 protocol/contract
   明确版本与兼容策略，不需要则把玩法专有事件名迁回各自 `rulesets/<id>/`。
2. `src/cli.ts` 的定位是"内部调试工具"还是"要支持三个玩法的通用开发工具"？决定了 C4 怎么处理。
3. 如果做 A1 的座位常量去重，要不要顺带引入一个 `SeatVector<T>` 类型（替代仓库里反复出现的
   `[T, T, T, T]`/`([0,1,2,3] as SeatId[]).map(...)` 模式，比如 `handCounts`）？
   建议先只做 `SEAT_IDS` 单一来源 + `nextSeat`/`seatDistance` 下沉（A1+A2 范围），不引入新容器抽象；
   `SeatVector<T>` 收益需要看实际重复量，值得单独讨论，不要在去重 seat 常量的同一次改动里顺带引入。

---

## 建议执行顺序（仅供参考，未与用户最终确认）

1. A1 + A2（seat 常量与轮转逻辑去重）—— 收益最高，改动集中在 `lib/` + 两处 ruleset 引用
2. A3（INVALID_CONFIG 魔术字）—— 纯机械替换，风险最低
3. A5（events.ts 类型不一致）—— 一行改动
4. B1（合并 ids.ts / constants.ts）+ B4（seat.ts 改名）—— 依赖 A1 先完成
5. D + D1（注释英译中，去掉点名引用 plan.md 的写法）+ AGENTS.md 补充例外说明
6. A7（唯一 registry）—— 单独一次提交，触及 engine.ts dispatch 结构，需要完整 verify
7. B5（win.ts 改名/加说明）—— 和 B1 一起做
8. A4 / A6 / C1 / C2 / C3 / C4 —— 视情况决定是否处理，多数依赖 E 节的问题先有答案

每一步改完需跑 `pnpm --filter @new-mj/core verify` 全绿，`core` 改动照 AGENTS.md 要求跑 fuzz 冒烟 ≥1000 局；
涉及公开契约或玩法边界的改动（主要是 A7、C2），文档与代码必须在同一提交更新。
