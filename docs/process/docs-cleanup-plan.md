# 文档体系清理重构

> 范围：废弃 `decisions.md`，把文档体系从"活文档 + 决策记录"两层收成一层。背景与既有设计取舍见下方"结论"。项目总状态见 [`plan.md`](./plan.md)。

## 结论（这次重构的依据）

维护一份独立的"决策记录"文件，本身消耗的时间超过它带来的价值——逐条重新审视 `decisions.md` 现有 30 多条后，真正经得起下面这条测试的不到 10 条：

**一条内容值得单独记录，必须同时满足**：
1. 代码看不出——不是打开文件就能看到的当前结构/字段名/文件布局/工具选型。
2. 文档没写过——不是某条已经在 `AGENTS.md`/`architecture/*.md`/`contracts/*.md` 里写死的通用规则，在具体案例上的重复应用。
3. 不是常识——不是任何合格实现者本来就会遵守的普适工程原则。
4. 不能用"到时候再说"打发——如果"以后 X 发生了会怎样"这件事，X 一旦发生本来就要重新设计/讨论，就不用现在先写。
5. 确实改变结果——能具体说出"没有这条，未来某个正常开发路径会做错什么"，不是"少一轮重新讨论"。

按这条测试过一遍，剩下的内容分两类：
- **性质上是架构决策**（技术栈选型、协议/状态机边界、跨端复用约束等）——直接并进对应的 `architecture/*.md`/`contracts/*.md`，不再单独存在 `decisions.md` 里。
- **性质上是"非架构的坑"**（工具/库使用陷阱、没有权威来源的规则解释判断）——直接写成代码里的"为什么"注释，不单独立档。

不满足以上任意一条的（历史叙事、已被后续决策取代的旧机制、纯清单），直接删除，不留存根、不留指针、编号可以留空。

## 待办

- [ ] 核实并搬迁仅存在于 `decisions.md`、代码/其他文档没有承接的两条内容：
  - D24（`packages/core` 的 `development` export 条件为什么直接消费 `src` 而不是只监听 `dist/*.d.ts`）→ 写进 `packages/core/AGENTS.md`，替换掉现有的"见 `decisions.md` D24"指针。
  - BB2（血战杠上花/操作类附加番叠加口径，未经权威规则来源确认、按通用实现处理的判断）→ 写进 `packages/core/src/rulesets/bloodbattle/scoring.ts` 对应逻辑旁的注释。
  - 其余核实过的条目（D16 认证 fallback、D23 `.env` 分层、D31 的两个 motion 使用坑、J 的 `extraTiles` 钩子）已经在代码里有对应注释，删除时不会丢信息，不用再搬。
- [ ] 删除 `docs/decisions.md`。
- [ ] 清理引用 `decisions.md`/D 编号的约 30 个文件（已 grep 出清单，逐处按上面的测试判断：解释已经写完只是挂了个引用标签的，直接摘掉标签；引用处本身就是唯一解释来源的，先把内容写进引用处再摘标签）：
  - 代码注释：`.env`/`.env.example`/`.env.test`、`packages/core/src/engine.ts`、`packages/core/src/lib/omniscient.ts`、`packages/protocol/src/common.ts`、`apps/server/src/gateway/rooms.gateway.ts`、`apps/server/src/config/config.service.ts`、`apps/server/src/core/game.service.ts`、`apps/server/src/persistence/persistence.service.ts`、`apps/server/src/persistence/prisma.service.ts`、`apps/server/src/rooms/room.service.ts`、`apps/web/src/views/TableView.tsx`、`apps/web/test/app.e2e-spec.ts`、`apps/web/playwright.config.ts`、`packages/core/test/cross-ruleset-invariants.test.ts`、`packages/core/test/bloodbattle/scoring.test.ts`。
  - 文档：`README.md`、`docs/overview.md`、`docs/architecture/{system,data-model,key-designs,variant-boundary,frontend-layout}.md`、`docs/contracts/{engine-contract,protocol-shared,session-mechanics}.md`、`docs/variants/{junk,bloodbattle}.md`、`docs/testing-strategy.md`、根 `AGENTS.md`、`apps/server/AGENTS.md`、`apps/web/AGENTS.md`、`packages/core/AGENTS.md`。
- [ ] 重构 `docs/doc-map.md` 本身（它把 `decisions.md` 定义成文档体系正式的一层，删除文件不能只删文件，要把这层从体系里摘掉）：
  - §1 目录结构：去掉 `decisions.md` 一行。
  - §2 文档清单表格：去掉"记录级"这一行。
  - §2.2（`decisions.md` 的精简规则）整节删除。
  - §2.3（过程文档详略原则）里"分流进 `decisions.md`/`architecture/*.md`"改成只提 `architecture/*.md`。
  - §5（阶段设计内容分流规则）里所有提到 `decisions.md` 的分流选项去掉。
  - §6（阶段收尾仪式）第 1 步"架构级变更 → 追加 `decisions.md`"改成"架构级变更 → 直接写进对应 `architecture/*.md` 段落"。
- [ ] 更新 `docs/overview.md` 的阅读地图/文档清单表格（去掉 `decisions.md` 相关行）与 `README.md` 的一行指针。
- [ ] 全部完成后跑一遍 `grep -rn "decisions.md" .`（排除 node_modules）确认零残留；`pnpm verify` 确认没有因为改注释/文档误伤代码。
