# plan：阶段路线与状态

> 过程性文档：阶段状态与待办在此维护，收尾清理。需求与架构见 architecture.md / decisions.md。

## 需求（不变基线）

1. Web + 移动端 App
2. 多玩法：垃圾胡（第一，验证架构）→ 血战到底（第二）→ 后续扩展
3. AI 与真人混桌（必须有真人）；4. 多局并行；5. Google/GitHub 登录
4. 架构可扩展即可，允许有边界重构；7. 非商用，不做数据兼容（可清对局表，保用户表，单向引用 userId）

## 阶段路线

| 阶段 | 内容                                                                 | 验收                      | 状态 |
| ---- | -------------------------------------------------------------------- | ------------------------- | ---- |
| 0    | 规则与契约定义                                                       | 四份规格文档定稿          | ✅   |
| 1    | core 基建 + junk RuleSet + CLI fuzz                                  | CLI 整局 + 1 万局 fuzz 绿 | ✅   |
| 1.5  | bloodbattle RuleSet（允许一次接口调整）                              | 番型用例全绿 + fuzz       |      |
| 2    | server：gateway/RoomManager/托管/AI 补位（可与 1.5 并行，基于 junk） | 4 模拟客户端整局          |      |
| 3    | web：登录/大厅/牌桌（先竖切）                                        | 浏览器真人对局            |      |
| 4    | 持久化：事件日志落 PG/战绩/重连/回放调试页                           |                           |      |
| 5    | mobile（Expo）                                                       |                           |      |

> 阶段 2/3 说明：protocol、PlayerView、UI 架构按 `core-types-and-events.md`/`protocol.md` 中已覆盖两套规则的契约实现，但先只接入 junk 的具体规则跑通产品；血战规则接入时应是增量（新增阶段/组件），不重新设计协议或 UI 架构——若届时仍需动老代码，说明契约本身有遗漏，应回头补文档而非默认接受重构。

## 阶段 1：已完成（tag `phase-1`）

TypeScript monorepo、纯函数 core、junk RuleSet、CLI 与 fuzz 全部完成并测试通过；实施步骤见 git 历史（`8bd6aa3`…`587693d`）。契约留存于 `core-types-and-events.md`/`rules-junk.md`，取舍理由见 `decisions.md`。

**下一步第一个动作**：为 `bloodbattle` 建立失败的番型/换三张/定缺 fixture，并据此评审 RuleSet 接口调整。

## 阶段 1.5：进行中

`scoreBloodbattleHand`（`packages/core/src/rulesets/bloodbattle/scoring.ts`）和换三张/定缺两个阶段（`packages/core/src/rulesets/bloodbattle/prelude.ts` 的 `createBloodbattlePrelude`/`applyExchangeThree`/`applyChooseLack`）已经**真实实现**（不再是 `NOT_IMPLEMENTED` stub）。`packages/core/test/bloodbattle/scoring.test.ts`（20 条 fixture，`test.each` 逐条真实断言）、`packages/core/test/bloodbattle/phases.test.ts`（换三张/定缺真实断言，含手牌是否正确交换、事件是否跨座位泄漏）都已摘掉 `test.fails`，真绿通过。

本轮结构整理：`tools/check-deps` 与其 Node 测试已统一为 TypeScript；core 的集成/契约/fuzz 测试统一放在 `packages/core/test/`，测试扫描、lint、类型检查配置已同步。

本轮 AI 指导文档整理：根目录 `CLAUDE.md`/`AGENTS.md` 仅保留全局规则；core 的实现约束、代码地图和局部 DoD 已下沉到 `packages/core/CLAUDE.md`/`AGENTS.md`，其他 package 暂不新增局部文件。

本轮工作流整理：所有 package/app 已增加局部 `verify`（typecheck + lint + test），根目录 `pnpm verify` 额外执行全局 `format:check`；DoD 默认改为执行根目录 `pnpm verify`。根目录新增 `typecheck:fix`/`lint:fix`。core 的 package 边界改为 Turbo 调度根级 `tsup` 构建 `dist` 与声明文件后供消费者检查，core 内部继续使用 package-local `@/*` alias。

**D12（core 结构反转，见 decisions.md）已裁决并落地**：`ruleset.ts`（旧 RuleSet 8 方法接口）已删除；`types.ts` 收窄为 engine-api 骨架；`JunkPhase`/`JunkAction` 与 `BloodbattlePhase`/`BloodbattleAction` 是独立类型，不再共用一个全局 `Phase`/`Action`。下面 6 个开放问题里的 #5 已经被 D12 回答。

**阶段 1.5 尚未验收**：Stage A 已落地 `playing ⇄ awaiting-claims` 的缺门出牌、碰/胡声明、头跳/一炮多响、多赢家离场、三家胡/牌墙耗尽出口，并已接入 `engine.ts` 注册表；杠分、抢杠胡、呼叫转移和流局查花猪/退税/查大叫已落地，血战 10000 局多配置 playing fuzz 已通过，完整验收审计仍待完成。

写 fixture 时逼出的 10 个开放问题里，3 个规则内容问题已经由用户授权按血战到底通用口径处理掉（见 `decisions.md` **BB2**）：叠加歧义（原 5/6）、`bb-002` 牌数不一致（原 8，已修正 `rules-bloodbattle.md` 与 fixture）。`cappedAt` 语义（原 7）已经写进 `rules-bloodbattle.md`"约定"一节，不再是开放问题。其余架构问题已按 proposal 的 Stage A/B/C 边界确定，待后续代码验证：

1. `WinEvaluation`/`Settlement` 现在就变成真正的按手计分契约，还是继续像 junk 那样保持"薄、没人用"？
2. `GameResult`/结算是否需要比 `scoreDeltas: number[]` 更丰富的形状,来表达杠分实时结算 + 终局花猪/大叫（一手牌里有好几笔独立的付款/收款）？
3. 多赢家"胡了离场但整手牌继续"的语义——`BloodbattleState` 上要不要一个正式的 active/won 字段？（`variantState` 已随 D12 撤销，不再是"塞进命名空间 vs 上顶层字段"的选择，答案默认是后者，只是字段形状还没定。）
4. "四家各自独立提交、收齐后自动推进"这个模式，现在在 junk 的 `pendingClaims` 和血战的 `exchange`/`lack` 之间已经重复了一遍——要不要抽成共享辅助逻辑？候选 lib 抽取点，D12 本轮不做（只有两个真实使用场景，还没到"第三次出现再提炼"的门槛），留到血战 playing 阶段真正需要声明窗口裁决时一并评估。
5. ~~`bloodbattle.ts` 现在就该长成一个类型完整的 `RuleSet` 对象，还是先保持独立函数？~~ **已回答（D12）**：不长成旧 `RuleSet` 接口的形状（该接口已删除）；长成独立的 `rulesets/bloodbattle` 模块，自有 `applyAction`/`getLegalActions`/`getPlayerView`，不共享 junk 的类型。playing 阶段落地时再补齐这三个函数并注册进 `engine.ts`。
6. config 解析的边界：`scoreBloodbattleHand` 只接受已经解析好的具体 config 值；`"standard"` 别名的展开放在测试文件里做。确认真正的 ruleset 落地后，config 解析这个职责该放在哪。

**Stage B 进行中**：暗杠、补杠、直杠已实现基础副露、在场付款、杠分账本和补摸；补杠抢杠胡窗口已接入，抢杠胡不产生杠分付款；杠上炮呼叫转移、流局查花猪、退税和查大叫已接入并有付款账本 fixture；10000 局多配置 playing fuzz 已接入。完整验收审计尚未完成。

本轮事件一致性补齐：bloodbattle 已加入通用的“过滤事件重建 PlayerView ≡ 直接派生”测试；为公开杠事件补充牌型信息，为出牌者补充仅 seat 可见的确切 TileId 事件，覆盖换三张/定缺/playing 回放；core 测试现为 55 条并全绿。

**下一步第一个动作**：整理 engine-api 对自定义 PlayerView 形状的类型边界方案，明确哪些类型应在公共 engine-api 保留、哪些仅由具体 ruleset 导出，再提交方案供确认。

## 待办

- [x] 阶段 1.5 前：rules-bloodbattle.md 定稿（番型互斥、杠分、呼叫转移、退税与终局结算顺序已确认）
- [ ] 阶段 2 前：房间与对局关系模型——已决定连续 N 局（非一局即散，见 decisions.md D11）；N 值、底分倍率、庄家轮换等细节待阶段 2 设计并产出至 protocol.md 或 docs/rooms.md
- [ ] 阶段 2 前：AI 定位确认（建议：简单启发式补位）
- [ ] 阶段 5 前：mobile 具体路线（是否 react-native-web 统一）
- [ ] 真人协作触发时：repo 权限、是否上分支保护
