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

`scoreBloodbattleHand`（`packages/core/src/rules/bloodbattle-scoring.ts`）和换三张/定缺两个阶段（`packages/core/src/rules/bloodbattle.ts` 的 `createBloodbattlePrelude`/`applyExchangeThree`/`applyChooseLack`）已经**真实实现**（不再是 `NOT_IMPLEMENTED` stub）。`packages/core/test/bloodbattle-scoring.test.ts`（20 条 fixture，`test.each` 逐条真实断言）、`packages/core/test/bloodbattle-phases.test.ts`（换三张/定缺真实断言，含手牌是否正确交换、事件是否跨座位泄漏）都已摘掉 `test.fails`，真绿通过。`types.ts` 的 `Phase`/`Action` 血战部分维持不变。`ruleset.ts` 仍未动。

**阶段 1.5 尚未验收**：`playing ⇄ awaiting-claims` 的出牌/吃碰杠/胡牌/多赢家/杠分实时结算/终局查花猪查大叫都还没做，也没接入 `engine.ts` 的 `getRuleSet` 注册表、没有 fuzz——这部分体量上相当于阶段 1 当年的"Junk 完整流程"步骤，是下一轮的工作。

写 fixture 时逼出的 10 个开放问题里，3 个规则内容问题已经由用户授权按血战到底通用口径处理掉（见 `decisions.md` **BB2**）：叠加歧义（原 5/6）、`bb-002` 牌数不一致（原 8，已修正 `rules-bloodbattle.md` 与 fixture）。`cappedAt` 语义（原 7）已经写进 `rules-bloodbattle.md`"约定"一节，不再是开放问题。剩下 6 个是架构层面的，还没答案，继续挂着：

1. `WinEvaluation`/`Settlement` 现在就变成真正的按手计分契约，还是继续像 junk 那样保持"薄、没人用"？
2. `GameResult`/结算是否需要比 `scoreDeltas: number[]` 更丰富的形状,来表达杠分实时结算 + 终局花猪/大叫（一手牌里有好几笔独立的付款/收款）？
3. 多赢家"胡了离场但整手牌继续"的语义——`GameState` 上要不要一个正式的 active/won 字段，还是完全塞进 `variantState`？
4. "四家各自独立提交、收齐后自动推进"这个模式，现在在 junk 的 `pendingClaims` 和血战的 `exchange`/`lack` 之间已经重复了一遍——要不要抽成共享辅助逻辑（D9 预期的"有边界的调整"）？
5. `bloodbattle.ts` 现在就该长成一个类型完整的 `RuleSet` 对象，还是先保持独立函数（本轮选后者，等第 1 条有答案再说）？
6. config 解析的边界：`scoreBloodbattleHand` 只接受已经解析好的具体 config 值；`"standard"` 别名的展开放在测试文件里做。确认真正的 ruleset 落地后，config 解析这个职责该放在哪。

**下一步第一个动作**：针对上面 6 个架构问题，趁着现在只有 junk+血战两个真实实现，定下 `RuleSet` 接口要不要做那"一次有边界的调整"（D9），然后再动手写 `playing` 阶段的出牌/声明窗口/多赢家结算。

## 待办

- [x] 阶段 1.5 前：rules-bloodbattle.md 定稿（番型互斥、杠分、呼叫转移、退税与终局结算顺序已确认）
- [ ] 阶段 2 前：房间与对局关系模型——已决定连续 N 局（非一局即散，见 decisions.md D11）；N 值、底分倍率、庄家轮换等细节待阶段 2 设计并产出至 protocol.md 或 docs/rooms.md
- [ ] 阶段 2 前：AI 定位确认（建议：简单启发式补位）
- [ ] 阶段 5 前：mobile 具体路线（是否 react-native-web 统一）
- [ ] 真人协作触发时：repo 权限、是否上分支保护
