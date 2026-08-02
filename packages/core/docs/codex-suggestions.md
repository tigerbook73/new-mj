# core 结构改进建议

> 本文是针对 `packages/core` 的只读审计结论和候选实施计划，不代表已批准的设计，也不改变当前运行行为。它是本专题的结构路线图；`claude-suggestions.md` 保留为带精确位置的一次性审计清单。实施任何 slice 前，先确认其是否触及 `docs/architecture/variant-boundary.md`、`docs/contracts/engine-contract.md` 或玩法规则文档。

> 进度（2026-08-02）：Slice A、已确认的事件迁移、junk CLI 定位、Slice E 的 `INVALID_CONFIG`/`SeatId` 机械项、Slice B（唯一 ruleset registry）、Slice E 的 `lib/seat.ts`→`seat-state.ts`/`lib/win.ts`→`standard-hand.ts` 改名均已完成；后续从 `RuleViolation.code` 收敛与剩余注释英译中开始。

## 目标与非目标

目标：让文件归属、公共边界和四人座位模型更容易从目录与类型中识别；减少新增玩法时必须修改无关公共文件的情况；消除已确认的重复注册和重复座位定义。

非目标：

- 不抽取跨玩法的“大麻将状态机”、声明优先级、胡牌、计分、结算或庄家轮换公式。
- 不改变 engine 的时间、可见性、身份、TileId 或 ack 契约。
- 不以“消灭所有字面量”为目标；玩法规则中的局部数字和判别字符串可保留。
- 不把内容写进 `CLAUDE.md`。项目 `docs/doc-map.md` 已规定该文件仅是指向同目录 `AGENTS.md` 的兼容入口。
- 不合并三种玩法中“能否构成胡牌形状”的回溯算法；无癞子、带财神和按花色计分的前提不同，当前重复是有意的规则边界。

## 现状地图

| 区域                                 | 应承担的职责                                 | 当前观察                                       |
| ------------------------------------ | -------------------------------------------- | ---------------------------------------------- |
| `src/index.ts`                       | 对外导出面                                   | 合理                                           |
| `src/engine.ts`                      | 按 rulesetId 分发的通用 engine API           | 合理，但与注册表耦合                           |
| `src/types.ts`                       | 跨玩法最小模型                               | 合理                                           |
| `src/events.ts`                      | 事件信封、可见性、序号与过滤                 | 合理；不应继续承载玩法专有事件名               |
| `src/lib/`                           | 无玩法立场的纯函数与共享模型                 | 整体合理，但 seat / constants / ids 的职责重叠 |
| `src/rulesets/<id>/`                 | 玩法私有规则、状态、事件 payload、视图、计分 | 应继续保持私有，不因暂时同构而合并流程         |
| `src/support/registered-rulesets.ts` | 跨玩法测试辅助                               | 与运行时 registry 重复，可能漂移               |
| `src/cli.ts`                         | 当前仅支持 junk 的 CLI                       | 根目录名字暗示通用能力，定位不清               |

## 设计原则

1. 只有纯编排、纯传输或被多个实质不同玩法验证的能力才能转入公共实现；玩法规则默认留在玩法目录。具体判定遵循 `docs/architecture/variant-boundary.md`。
2. 每个稳定事实只保留一个运行时来源。类型别名可围绕它派生，不能另复制同一份数组或 registry。
3. 文件名与目录优先承担职责说明；只有公共边界、算法前提、可见性/不变量等无法从代码看出的内容才写简短中文模块注释。
4. 代码注释不复制规则正文、不记录专题历史、不引用会被清理的 `plan.md`；AI 工作护栏只写入 `AGENTS.md`。
5. 不为了形式去掉所有字面量：四座基础设施、跨模块错误码、玩法事件登记值得收敛；单个算法局部的 `2`、`3`、`7` 等须按可读性判断。
6. 本包新增或修改的代码注释统一使用中文；在 `packages/core/AGENTS.md` 明确这条包级约束，以覆盖全局 AI 配置中可能存在的英文注释默认值。

## 候选 slice

### Slice A：统一四人座位基础设施

现状：`lib/ids.ts` 的 `SEATS`、`lib/constants.ts` 的 `SEAT_IDS`、bloodbattle 的 `BLOODBATTLE_SEATS` 都定义了 `[0, 1, 2, 3]`；前两份当前没有业务引用，bloodbattle 的一份才被实际使用。玩法内另有约二十处数组字面量、`% 4`、`nextInt(..., 4)`、四元 tuple 与零值数组。

建议目录：

```text
lib/
  ids.ts          SeatId、TileId、TileKind
  seats.ts        SEAT_IDS、SEAT_COUNT、nextSeat、seatDistance、SeatVector<T>
  seat-state.ts   Meld、DiscardEntry、SeatState
```

实施要点：

- 只保留一个 `SEAT_IDS` 值来源；删除其余等价常量。
- 将固定四座的公共机械运算下沉到 `seats.ts`。
- 玩法继续拥有“何时轮庄、谁能行动”的规则；公共化的只是四座环的数学操作。
- junk / hangzhou 中完全相同的 `nextSeat` 与座位相对距离公式应复用；bloodbattle 的换三张方向计算语义不同，继续留在玩法内。

`SeatVector<T>` 不属于本 slice 的既定范围。先以唯一座位来源和两个重复运算收敛为止；四元 tuple 的重复量和值初始化模式稳定后，再决定是否引入容器类型或 helper。

验收：三个玩法创建、摸打、声明、结算、fuzz 与跨玩法不变量测试均通过；不改变任何事件 payload 或规则结果。

### Slice B：建立唯一 ruleset registry

现状：`engine.ts` 维护运行时 `rulesets`，`support/registered-rulesets.ts` 维护第二份测试列表，新增玩法必须同步两处。

建议：

```text
src/
  ruleset-registry.ts       运行时唯一的 rulesetId -> RulesetModule 登记
  engine.ts                 只负责按 registry dispatch
  testing/registered-rulesets.ts  从 registry 派生跨玩法测试适配
```

实施要点：

- registry 仍可以在异构边界使用受控的类型擦除；各玩法入口保持具体类型。
- 测试不再手写玩法清单，确保新玩法登记后自动进入跨玩法不变量测试。
- 这是纯编排能力，不抽取任何玩法规则。

验收：现有 engine API、跨玩法不变量与所有已登记玩法的测试保持通过；新增一条测试确认 registry 的 id 与 ruleset config id 一致。

### 决策门：事件名是否是跨包稳定枚举

现状：`events.ts` 同时承担通用事件信封和三玩法事件名全集，包含 bloodbattle 专有的换三张/定缺事件。`EventType` 不能表达“某玩法可发哪些事件”，实际约束由各玩法 payload 联合承担。

已确认：`EventType` **不是**跨包稳定枚举。公共层只保留事件信封与可见性；事件名和 payload 判别联合迁回各自 ruleset，并同步更新 `engine-contract.md` 与 `variant-boundary.md`。

目标结构：

```text
src/events.ts
  GameEvent<T>、EventVisibility、createEvent、nextEventSeq、eventsVisibleTo
  必要时保留真正共享的 payload 类型

src/rulesets/<id>/events.ts
  该玩法 EVENT_TYPES 与 XxxEventPayload
```

实施要点：

- 不保留无实际契约作用的全局 `EventType`；若外部确实需要稳定事件注册表，应另行设计为明确的协议契约。
- 事件名和它的 payload 判别联合放在同一玩法边界。
- 保持 `GameEvent` 的 `seq` 与 `visibility` 语义不变，server 仍只按可见性过滤，不解释规则。

验收：每个玩法的事件重放等于实时 PlayerView；私有 TileId 不出现在不应可见的事件中；protocol 不出现无意的变更。

### 可选整形：玩法内部按职责拆分

现状：三个 `state-machine.ts` 为 538–654 行；三个 `view.ts` 同时处理实时视图投影和事件重放。junk 与杭州有大量同构，但已经存在足以阻止共享状态机的规则差异。该项没有正确性收益，只有在相应文件继续增长或一次功能改动已难以定位职责时才启动。

建议的玩法内形状（按实际复杂度采用，不要求一次到位）：

```text
rulesets/<id>/
  index.ts          玩法公开入口与 RulesetModule 适配
  types.ts          玩法状态、动作、配置、结果与视图模型
  events.ts         玩法事件名与 payload
  state-machine.ts  action 路由、阶段切换
  playing.ts        摸、打、杠、胡等进行中流程
  claims.ts         声明窗口
  settlement.ts     结算（需要时）
  player-view.ts    从实时状态派生 PlayerView
  replay-view.ts    从事件流重建 PlayerView
```

实施要点：

- 优先拆 `view.ts` 为实时投影与重放；它们是明确的两个职责。
- 再按玩法分别拆状态机；不创建 junk/hangzhou 的共享流程模块。
- 对新增私有 helper，优先放到最近的玩法文件；只有被不同玩法验证过的纯工具才考虑下沉 `lib/`。

验收：每个移动保持或新增同位置单测；跨玩法不变量、事件重放测试和 fuzz 全绿。

### Slice E：名称、注释与错误码收敛

候选调整：

- ✅ 已完成 `lib/constants.ts` 只含座位常量，随 Slice A 删除并迁入 `seats.ts`。
- ✅ 已完成 `lib/seat.ts` 改名为 `seat-state.ts`。
- ✅ 已完成 `lib/win.ts` 改名为 `standard-hand.ts`，文件头加了假设说明。
- 已确认 CLI 是 junk 的开发/诊断工具：移至 `rulesets/junk/cli.ts`，根脚本改为 `cli:junk:play` 与 `fuzz:junk`；不在本次泛化 `--ruleset`。
- 三个玩法的 config 解析器统一引用既有 `CORE_ERROR_CODES.invalidConfig`，替换重复的 `"INVALID_CONFIG"` 字面量。这是无语义变化的机械收敛。
- `eventsVisibleTo` 使用既有 `SeatId` 类型断言，替换唯一一处内联 `0 | 1 | 2 | 3` 联合。
- 每玩法为可返回给调用方的 `RuleViolation.code` 建立受约束的错误码联合/常量；`UNKNOWN_ACTION` 的三处重复可随此项一并收敛。不要强行把阶段、动作等可读判别字符串改为常量。
- `Record<SeatId, T>` 的键在运行时会转为 string；junk / hangzhou 的 `Number(key) as SeatId` 可评估为低优先级 `seatKeysOf` 辅助函数，只有第三处出现或调用点继续增长时才下沉。
- 将保留的注释统一为中文，删去重复类型信息、过期“当前有两个玩法”等描述和对 `plan.md` 的历史引用；在 `packages/core/AGENTS.md` 增加本包中文注释规则。优先清理 `hangzhou/hand.ts`、`junk/types.ts`、`hangzhou/types.ts`、`junk/state-machine.ts` 中点名 `plan.md` 条目的四处注释：改为直接陈述不变量，耐久规则则分流到 `variants/<id>.md`。
- 同时校正 `engine.ts` 的 `RulesetModule` 注释：当前“five functions”与实际成员数不符，且“both rulesets rotate clockwise”已不符合包含杭州连庄的现状。

不作为重构目标的项目：

- `rulesets/*/constants.ts` 的对称存在不是问题。相位、牌集、玩法配置等立场常量应保留在各玩法目录。
- `lib/win.ts`、`rulesets/hangzhou/hand.ts`、`rulesets/bloodbattle/scoring.ts` 中的回溯算法不合并。三者分别处理标准无癞子牌型、财神替代和血战按花色计分，抽取共同骨架会模糊玩法规则边界。

验收：类型检查能阻止错误码拼写漂移；公开错误码若被 protocol/server 消费，先同步契约与对应测试。

## 推荐实施顺序

1. Slice A（座位）
2. Slice E 中的机械项（`INVALID_CONFIG`、`SeatId` 断言、中文注释规则）
3. Slice B（registry）
4. 事件迁移（已确认不维护全玩法 `EventType`）
5. Slice E 其余命名/错误码项；玩法内拆分仅在出现实际维护压力时启动

每个 slice 应保持可独立审阅，并执行 `pnpm --filter @new-mj/core verify`；涉及 core 行为或规则的修改按根 `AGENTS.md` 同时跑相应 fuzz，最低 1000 局。若涉及公开契约或玩法边界，文档与代码必须同步更新。

## 尚待决定的问题

1. `SeatVector<T>` 是否会在座位来源收敛后仍减少真实维护成本？若未来决定引入，第一版仅做 tuple 别名，不增加容器 API。
2. 当第二个玩法需要 CLI replay/fuzz 时，基于真实 config/action 形状重新评估通用 `--ruleset` CLI。
