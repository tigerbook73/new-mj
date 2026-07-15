# D12：core 结构反转（方案 C）设计存档

> 状态：候选存档，未裁决落地。裁决所需的两个输入已确认（日麻优先级=确定做，方案=C）；本文件是设计存档，采纳并执行完成后按 doc-map 惯例应删除本文件，结论已并入 decisions.md/architecture.md/core-types-and-events.md/AGENTS.md/plan.md/protocol.md。

## Context

现行 core 模型是「通用框架 + RuleSet 插件」（D6）：`engine.ts` 拥有分发，规则通过 `RuleSet` 8 方法接口注入差异。这个模型的病症是变化点只有写具体规则时才暴露，专用物容易不断上移进通用层。

裁决所需的两个输入已经拿到：

1. **日麻优先级：确定做**（用户已确认）。日麻的差异（王牌区/宝牌改变牌墙结构、四风连打等中途流局出口、"无役不能和"击穿胡牌判定∥计分分离、立直后行为模式切换）是**控制流级**差异，不是数据/枚举级差异，方案 A/B（共用中式回合循环模块）无法容纳。
2. **core 现状审计**：`engine.ts`（20 行）目前是干净的按 `rulesetId` 查表分发，全仓库无 `if (rulesetId === ...)` 分支，尚未真正腐化；但 `ruleset.ts` 的 8 方法接口注释已自称"junk 一次性实现的形状，血战落地会强制调整"，且 grep 证实 `getClaimOptions`/`resolveClaims`/`evaluateWin`/`settle`/`parseConfig` 在全仓库范围内**零消费者**（只有声明和 junk 实现）。`bloodbattle.ts` 尚未注册进 `engine.ts` 的分发表，没有真正撞上 `applyAction` 边界——这是切换模型成本最低的窗口，越往后拖，血战一旦塞进旧接口，将来还要二次拆分。

因此裁决结果：**采用方案 C（完全反转）**。新模型三件套：`engine-api`（极小冻结外壳：`createGame`/`applyAction`/`getLegalActions`/`getPlayerView` 四签名 + 事件信封 + PlayerView 骨架）← 各玩法在 `rulesets/<id>/` 下实现完整状态机（自有 State/Action/Phase，互不 import 对方流程代码）→ 调用 `lib/`（无观点纯函数积木：牌/墙/PRNG/手牌分解/容器不变量）。`variantState: unknown` 字段撤销——规则状态本身就是完整状态。

目录组织采用"lib + rulesets/* + 核心入口在根目录"（命名用 `lib` 不用 `common`，与提案原文术语一致）。

**审计中的两处重要纠偏**（已抽查 `decisions.md`/`ruleset.ts`/`view-reducer.ts` 三个文件核实成立）：

- `docs/decisions.md` 的 **D11 编号已被占用**（"房间对应连续 N 局"），本次决策记录必须编号为 **D12**。
- `view-reducer.ts` 并非通用基建，而是硬编码了 junk 事件词汇表（`ChiMade`/`PengMade`/`TurnStarted` 等 case 分支）的 junk 私有逻辑，必须搬进 `rulesets/junk/`，不能进 `lib/`。

## 目录结构（before → after）

```
# BEFORE
packages/core/src/
  types.ts (147行, GameState/Action/Phase/GameConfig 全局单一)
  ruleset.ts (46行, RuleSet 8方法接口)
  engine.ts (20行, ruleSets 表 + 分发)
  tiles.ts / prng.ts / wall.ts / win.ts / invariants.ts / events.ts / view-reducer.ts
  simulate.ts / cli.ts (junk-only 工具)
  rules/
    junk.ts (660行, 唯一完整 RuleSet 实现)
    bloodbattle.ts (186行, 自由函数, 半成品)
    bloodbattle-scoring.ts (217行)
  index.ts

# AFTER
packages/core/src/
  types.ts      # engine-api 骨架：GameConfig/PlayerViewBase/GameResultBase/RuleViolation/ApplyResult<TState>
  events.ts       # 不变：事件信封类型 + 三个纯函数（保留在 root，理由见下）
  engine.ts         # 四签名 + RulesetModule 消费侧类型 + 静态注册表（新增 createGame/getPlayerView）
  index.ts            # 显式分类 re-export（不再是无脑 export *）

  lib/                # 无观点纯函数积木
    ids.ts, tiles.ts, prng.ts, wall.ts, seat.ts, win.ts, invariants.ts

  rulesets/
    junk/
      types.ts, config.ts, state-machine.ts, claims.ts, view.ts（含原 view-reducer.ts）, fuzz.ts（含原 simulate.ts）, index.ts
    bloodbattle/
      types.ts, prelude.ts, scoring.ts, index.ts
      # 本轮仍不注册进 engine.ts——playing 阶段未实现，非遗漏

  cli.ts             # 薄壳，import 指向 rulesets/junk/fuzz.ts
```

`engine-api` 不建独立子目录——四签名+事件信封+PlayerView 骨架体量本来就小，直接是 root 的几个文件。

## 类型拆分要点

- **root 保留**：`GameConfig`（开放索引）、`PlayerViewBase`（seat/hand/seats/wallCount/currentSeat）、`GameResultBase`、`RuleViolation`、`ApplyResult<TState>`。`events.ts` 的信封类型 + `createEvent`/`nextEventSeq`/`eventsVisibleTo` 保留在 root（不迁入 lib）——因为它零耦合、提案图示明确把事件信封列为 engine-api 拥有物，拆到 lib 反而制造 lib→root 的循环依赖风险。
- **lib**：`ids.ts`/`seat.ts` 是从 root 拆出的纯类型；`tiles/prng/wall/win.ts` 原样搬移只改 import 路径；`invariants.ts` 是唯一一处**类型签名要改**的 lib 文件——`assertContainerUniqueness`/`assertTileConservation` 从写死 `GameState` 改成 `<S extends { wall: readonly TileId[]; seats: readonly SeatState[] }>` 泛型，函数体不变。`test/foundation.test.ts` 里已经在用一个塞了虚构 `rulesetId: "test"` 的对象跑这两个函数，正好印证它们只关心 `wall`/`seats`，泛型化后可以直接简化成 `{ wall, seats }` 字面量。
- **junk**：`JunkAction`/`JunkPhase`/`JunkConfig`/`JunkState`/`JunkPlayerView` 等具名类型替代全局 `Action`/`GameState`/`PlayerView`；`variantState` 字段本来就是空的，直接删除。
- **bloodbattle**：`BloodbattleState` 不再共用 junk 的 `GameState`；`variantState.exchange`/`variantState.lack` 拍平为 state 顶层的 `exchange?`/`lack?` 字段；新增具名 `BloodbattleConfig`（原来是内联对象）。
- **RuleSet 接口彻底退役**，不保留"变薄版"：`getClaimOptions`/`resolveClaims`/`evaluateWin`/`settle`/`parseConfig` 五个方法零消费者，继续强制所有玩法实现是 D12 想终结的"框架反向决定规则形状"。`engine.ts` 内联一个消费侧最小类型 `RulesetModule<TState, TAction, TConfig>`，只含 `createGame`/`applyAction`/`getLegalActions`/`getPlayerView` 四个真正被调用的函数；各玩法要不要额外暴露 `getClaimOptions` 之类的辅助函数是自己的实现细节，不再是被迫满足的公共契约。`engine.ts` 用**静态 map**分发（不用动态 `import()`——后者是异步的，会破坏 `applyAction` 同步纯函数的不变量）。

## 按 commit 分组的执行步骤

关键约束：`GameState`/`Action` 从全局单一拆成按玩法私有，在 TS 编译层面是**不可再切分的原子提交**（不存在半新半旧的中间态）。因此前三个 commit 是纯目录搬移（类型形状不变，全程 typecheck 保持绿），第 5 个 commit 是唯一一次类型翻转的原子提交。

1. **docs：追加 D12 决策记录**（不动代码）——`decisions.md` 追加 D12 条目（编号见上，不可用 D11）。
2. **lib/ 抽取**（纯搬移）——新增 `lib/{ids,tiles,prng,wall,seat,win,invariants}.ts`，删除 root 对应文件；`invariants.ts` 做泛型化签名调整；其余文件只改 import 路径。验证：`typecheck && lint && test` + `cli.ts fuzz --games 1000` 冒烟（DoD 要求）。
3. **rulesets/junk/ 抽取**（纯搬移+文件拆分）——660 行 `junk.ts` 按职责拆成 `config/state-machine/claims/view.ts`；`view-reducer.ts` 的 `rebuildPlayerView` 一并搬进 `rulesets/junk/view.ts`（它本来就是 junk 专属逻辑）。类型仍用 root 的 `Action`/`GameState`，不做翻转。验证同上。
4. **rulesets/bloodbattle/ 抽取**（纯搬移）——`bloodbattle.ts`/`bloodbattle-scoring.ts` 搬进 `rulesets/bloodbattle/{prelude,scoring}.ts`。验证：`bloodbattle-phases.test.ts`/`bloodbattle-scoring.test.ts` 全绿。
5. **原子提交：类型翻转**——`types.ts` 收窄为 engine-api 骨架；删除 `ruleset.ts`；`engine.ts` 改写为 `RulesetModule` + 静态 map，新增 `createGame`/`getPlayerView`（现状缺失）；新增 `rulesets/junk/types.ts`（`JunkState`/`JunkAction`/...）与 `rulesets/bloodbattle/types.ts`（`BloodbattleState`/`BloodbattleAction`/...），各文件内 `GameState`→`JunkState`/`BloodbattleState` 等做机械改名；`index.ts` barrel 改显式分类导出防止未来 riichi 加入时撞名；同 commit 内改完 `test/junk-engine.test.ts`、`test/foundation.test.ts`、`test/bloodbattle-phases.test.ts` 的类型标注（`bloodbattle-scoring.test.ts` 不受影响）。验证：`typecheck && lint && test` + 本地跑一遍 `cli.ts fuzz --games 10000`（比日常冒烟量更大，确认没有遗漏字段访问）。
6. **（可选，建议同批）跨 ruleset 不变量测试参数化**——把 `junk-engine.test.ts` 里"事件重建≡直接派生"的两处断言迁到新增的 `test/cross-ruleset-invariants.test.ts`，遍历一个只含 junk 的测试专用注册表（bloodbattle 要等 playing 阶段落地、四函数齐全后再加入）。`simulate.ts` 的 `playJunkGame`/`fuzzJunkGames` 移入 `rulesets/junk/fuzz.ts`，`cli.ts` 留根目录做薄壳——只是把 junk fuzz 逻辑放对目录，为将来 `--ruleset bloodbattle` 预留位置，不在本轮实现通用 fuzz 入口。
7. **文档收尾**——见下节，与 commit 5/6 同批或紧随其后。

## 文档改动清单

- **`docs/decisions.md`**：追加 D12 条目（编号确认为 D12，不是 D11），内容涵盖裁决依据（日麻控制流级差异）、新模型描述、`variantState` 撤销、实施方式（目录搬移为主）。
- **`docs/architecture.md` §4**（现第 40 行"core 分层"整段）：替换为"engine-api 外壳 + rulesets/* 独立状态机 + lib 积木"描述；D8 配置边界（变体间代码/变体内 config）不变。
- **`docs/core-types-and-events.md`**：§2 GameState 章节改标题为"状态形状（按 ruleset 私有）"，删除 `variantState` 段落；§3 Phase 拆成 `JunkPhase`/`BloodbattlePhase` 两个独立类型；§4 Action 改为"按 rulesetId 判别的各玩法私有联合"，11 个 junk 变体示例的去向（是否搬去 `rules-junk.md`）需要执行时确认；§6 PlayerView 拆成 `PlayerViewBase` 骨架 + 各 ruleset 扩展两段式。
- **`AGENTS.md`**：铁律 7 改为"`lib/` 不含玩法分支，复用以纯函数积木下沉为准；`rulesets/*` 互不 import 对方流程代码；玩法内部地方细则用 config（D8 边界）；server/client 不实现规则"；"代码地图"整段按新目录结构重写（≤10 行预算不变）。
- **`docs/plan.md`**：阶段 1.5 开放问题 #5（血战是否该长成 RuleSet 对象）标记为已回答（D12：不长成旧接口，长成独立 `rulesets/bloodbattle` 模块）。
- **`docs/protocol.md`**：第 40 行"`{ action: Action }`（core 的 Action 原样透传）"改为注明"按 rulesetId 判别的 Action 联合"（`packages/protocol` 目前只有占位常量，无 zod schema 需要跟着改，这是唯一需要动的文字）。

## 风险与下游影响

- **下游破坏面极小**：`packages/protocol`/`apps/server`/`packages/ai` 的 `src/index.ts` 目前都只有占位常量，没有任何代码依赖 core 的 `Action`/`GameState`/`RuleSet` 类型。全部需要跟着改的下游就是 core 自己的 4 个测试文件 + `simulate.ts`/`cli.ts`，已在步骤 5/6 列出。
- **最高风险点是 commit 5（类型翻转）的完整性**，不是"改坏别的包"。TS 的多余属性检查会兜底大部分遗漏（比如漏删某处字面量里的 `variantState: {}`），但 `lib/invariants.ts` 泛型化后的 `ExtraTiles` 钩子调用点建议 review 时单独确认泛型约束没有意外收窄。
- **依赖方向**：`lib`（零依赖）→ `rulesets/*`（依赖 lib + root 少量公共类型）→ `engine.ts`（依赖各 rulesets 做静态注册）。root 不反向依赖 rulesets。commit 5 落地时检查一遍 `lib/` 目录下没有 import `../types.ts` 或 `../rulesets/*`，避免循环依赖。
- **commit 2/3/4 可独立 revert**；commit 5 不能被部分 revert，出问题只能整体回退到 commit 4——这是"方案 C + 现在一次做完类型翻转"必然的代价，靠"commit 5 前先跑一遍本地全量 fuzz+test"降低概率。
- **后续可选加固**（不阻塞本次）：给 lint 或 dependency-cruiser 加一条"`rulesets/junk` 不得 import `rulesets/bloodbattle`（反之亦然）"的自动化检查，把"玩法间不互相 import"从人工承诺变成 CI 兜底。

## 验证

每个 commit 后跑：`pnpm --filter @new-mj/core typecheck && pnpm --filter @new-mj/core lint && pnpm --filter @new-mj/core test`；commit 2/3/4/5 各附一次 `node packages/core/src/cli.ts fuzz --games 1000` 冒烟（AGENTS.md DoD 要求 core 改动带 fuzz 冒烟 ≥1000 局），commit 5 建议额外跑一次 `--games 10000` 加强验证。全部 commit 完成后跑一次全仓库 `pnpm -w typecheck && pnpm -w lint && pnpm -w test` 确认 protocol/server/ai 未受影响。DoD 要求的 format:check 同步跑一遍。

## Critical Files

- `packages/core/src/types.ts`, `ruleset.ts`, `engine.ts`, `view-reducer.ts`, `invariants.ts`, `index.ts`
- `packages/core/src/rules/junk.ts`, `rules/bloodbattle.ts`, `rules/bloodbattle-scoring.ts`
- `packages/core/test/{junk-engine,foundation,bloodbattle-phases}.test.ts`
- `docs/decisions.md`, `docs/architecture.md`, `docs/core-types-and-events.md`, `docs/plan.md`, `docs/protocol.md`, `AGENTS.md`
