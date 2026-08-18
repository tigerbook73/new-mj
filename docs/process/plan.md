# 待完成任务与当前状态

> 本文件只记录当前专题、当前状态和下一步；未选定候选统一见 `backlog.md`。

## 当前任务

当前没有进行中的专题。Junk AI structural baseline consolidation 已完成；shanten/ukeire 已从
`packages/core` 迁移到 `packages/ai/src/junk/shanten/`（唯一消费者一直是 AI，core 自己的三个
ruleset 从不用它，迁移决定见 `docs/architecture/shanten.md`）；新增 `JunkBotAgent` 生产诊断上下文
（设计决定见 `packages/ai/AGENTS.md`/`apps/server/AGENTS.md`）。未选定候选见 `backlog.md`。

## 当前状态

- `recommendJunkAction`/`chooseJunkAction` 只接受 `PlayerView + legalActions`，固定委托给
  `structural-baseline@1`；server 的 bot 和 advice 路径均通过该公共 facade 使用同一策略。
- 当前生产范围包括普通标准型 discard、claim、gang 与 hu/zimo/draw 流程动作。七对、番型收益、
  防守和其他玩法路线尚未进入生产构牌目标，候选见 `backlog.md`。
- 弃牌先在同向听层做进张种类/张数的严格支配过滤，再按固定结构顺序最多搜索 5 个首弃；
  continuation 和最终选择使用确定性字典序，不使用可调权重。claim 必须严格改善结构，打平 pass；
  gang 必须严格胜过直接弃牌及其等价弃牌，打平 discard。
- 进张和 continuation 只消费本人手牌及公开牌河/副露，并按 `TileId` 去重；结果是玩家信息集下的
  结构估计，不是真实牌墙概率、整局胡牌概率或终局 EV。
- `fixtures/structural-baseline-v1.json` 固定 canonical 行为；完整 core 对局测试逐决策断言生产 facade
  与 v1 返回同一合法动作。有意改变行为时必须建立新 baseline 版本，不静默改写 v1。
- evaluation 只保留通用 baseline/candidate 能力：scenario provider、structural evaluator、Pareto、
  bounded/full teacher、policy loader/capture/diff、换位 match、arena、worker、checkpoint 和 report。
  loader 只按 Git ref/module/export 加载策略，不加载权重资产；evaluation 不从公共 package 导出。
- 旧 dynamic cliff、claim hurdle、analysis LRU 和有限总体概率近似没有保留实现；其中可重建的设计
  意图、拒绝理由和回归场景已记录在 `docs/architecture/shanten.md`。旧代码由 Git 历史承担回溯。
- `docs-and-names` 最终审计已收敛 public exports、Junk 源码根、evaluation CLI/fixture/test、README、
  架构、backlog 和本计划中的当前语义；历史术语只保留在明确标注的历史取舍中。
- onboarding 专题（Windows + WSL + VS Code 新成员上手）已完成并入 main：分步指南、非破坏性
  bootstrap、doctor 脚本、README/doc-map 入口均已就绪；完整 Supabase doctor 仍需在 Docker Desktop
  WSL Integration 可用的机器上验收。同批带入的 shanten 热路径优化（16-slot stride、two-change batch）
  已保留，过度展开的 `applyTransition`/四 block 单独展开方案已验证无收益并撤回。
- shanten/ukeire（`computeShanten`/`evaluateUkeire`/批量 API 等）已整体迁移到
  `packages/ai/src/junk/shanten/`，`packages/core` 不再公开导出；纯搬迁无行为变化。
- shanten ukeire 系列新增 `isReachable` 标准型局部性剪枝，经生产 self-play 路径
  （`evaluateStructuralDiscard`，非孤立单函数微基准）用 `evaluate scenario batch
  --evaluator structural-bounded` 验证过实际收益；评估过跨摸牌共享 prober 构建/
  删除上下文（旧 `two-ply.ts` 曾经这样做，随权重流水线一起删除），测出天花板
  约 4%、风险不成比例，未采纳。细节与复现方式见 `docs/architecture/shanten.md`
  "标准型局部性剪枝"节与 commit `b8fd0a1`。
- `JunkBotAgent`（`packages/ai/src/junk/bot-agent.ts`）是每座位一个的有状态封装，包一层无状态的
  `recommendStructuralBaselineV1ActionWithDiagnostics`；由 `apps/server` 的 `RoomService`
  实例化持有（`Room.botAgents`），每手开始重置，只服务 junk ruleset 的 bot/auto-piloted 座位。
  `ConfigService.botDecisionContextEnabled`（默认关闭）只控制诊断快照是否写进结构化日志，不影响
  决策本身；快照禁止进入 `PlayerView`/协议/客户端。`packages/ai/AGENTS.md` 的"不缓存/持有 core
  state"规则已收窄为：决策纯函数本身保持无状态，允许调用方显式实例化、显式管理生命周期的有状态
  封装。

## 下一步第一个具体动作

当前没有已选定的下一专题。由用户从 `docs/process/backlog.md` 选择候选后，再只为该候选建立
当前步骤的详细计划；不自动选择或预建未来专题。

## 阻塞与遗留问题

- 完整 Supabase doctor 需要在 Docker Desktop WSL Integration 可用的机器上验收。
- 尚未选定的工作统一保留在 `backlog.md`。
