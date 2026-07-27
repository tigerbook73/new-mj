# plan：项目状态与当前工作

> 本文件只保留项目基线、已完成能力、当前阶段与下一步。复杂阶段的范围、目标和待办另立 `process/<phase 简称>.md`，由本文件当前工作区链接过去（见 `doc-map.md` §5）。过程细节在阶段收尾时清理，耐久结论进入 contracts、architecture 或 decisions。

## 项目基线

- Web + 移动端，支持多个麻将玩法、AI 与真人混桌和多局并行；当前优先完成垃圾胡桌面体验。
- Google/GitHub OAuth 已用本地 Supabase 和真实账号端到端验证；生产部署尚未开始。
- 规则只在 core，时间只在 server，身份只取握手，状态遵循 ack/事件契约；完整铁律见根 `AGENTS.md`。

## 已完成能力

TypeScript monorepo、垃圾胡/血战到底 RuleSet、CLI/replay/fuzz、多房间 server、AI 补位与断线托管、Web 登录/大厅/房间/牌桌、主题、对局归档与 Supabase OAuth 均已落地。**Junk Table UX（桌面）专题（Phase 1–6，含 Phase 6 收尾后追加的动画优化）已全部完成并收尾**：Zone/LayoutPreset 几何层设计见 `architecture/frontend-layout.md`，完整操作 Dock（真人+AI 混桌可玩）、纯 CSS 布局重构均已落地；出牌/摸牌/副露成型/结算四类事件动画与三条跨区域飞行动画（独立临时克隆、不侵入真实渲染逻辑）已落地并通过 e2e/Storybook 验收；已知缺口见下方待办。**Table Layout Lab 增强及优化专题已完成并收尾**：用户实测反馈四点、表达式支持、item/变量排序、`$` 自动补全、Tree 折叠展开、Layout 文件读写 Save/Load 均已落地；随后把生产用的 `TableLayoutConfig`（tile 尺寸/discard 行列/actionDock 比例）从硬编码常量拆成独立文件 `apps/web/src/layouts/desktop.table-config.ts`，跟几何文件 `desktop.table-layout.json` 同目录同前缀配对，字段按 zone 种类重新分组命名；Lab 暂不编辑这份文件。bloodbattle 仍停留在公共桌面骨架（血战专属 UI 留待后续专题）。Nest server 构建使用 SWC，类型检查仍由独立 `typecheck` 脚本负责。最近一次根目录 `pnpm verify` 于 2026-07-26 全绿，覆盖 format、typecheck、lint、build、unit、e2e，以及 core 的 junk 1000 局和 bloodbattle 10000 局 fuzz。

## 当前工作：文档体系清理重构

结论：`decisions.md` 这类独立"决策记录"对本项目价值不大，维护它本身消耗的时间超过它带来的价值——大多数条目要么能从代码/其他架构文档推出来，要么是"以后重新讨论时自然会想到"的常识，真正经得起"没有这条记录 AI 会不会做错"这个测试的极少。方向：**不再维护独立的 decisions.md**，架构级的"为什么"直接写进对应的 `architecture/*.md`/`contracts/*.md`；不属于架构、但确实是"未来编程可能犯错"的坑，直接写成代码里的"为什么"注释，不单独立档。范围与具体待办见 [`docs-cleanup-plan.md`](./docs-cleanup-plan.md)。

**下一步第一个动作**：核实 `docs-cleanup-plan.md` 里列出的、目前只存在于 decisions.md 里、代码/其他文档没有承接的两条内容（D24 迁移进 `packages/core/AGENTS.md`，BB2 迁移进 `scoring.ts` 注释），确认写好后再批量清理其余引用。

## 待办

- [ ] 文档体系清理重构（当前工作，见 `docs-cleanup-plan.md`）。
- [ ] 部署 Supabase/应用，配置生产 OAuth 回调并验收。
- [ ] 基于 Zone/LayoutPreset 规划手机横屏/竖屏（Junk Table UX 收尾后可评估）。
- [ ] 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- [ ] mobile 路线与 Expo 实现；日麻立项时复审 `architecture/variant-boundary.md`。
- [ ] 可选沉浸体验：音效、音量与静音设置。
- [ ] 把摸牌（PICK）从"服务端自动转场的副作用"独立成 RuleSet 里显式的动作/状态，目的是让 UI 侧能在摸牌后插入可控延时；架构级改动（RuleSet 接口形状/协议语义），方案待和 Claude Project 对齐，不自行决定。
- [ ] Junk Table UX 已知缺口（不紧急）：Replay 页面（`ReplayView.tsx`，纯 JSON 渲染，风险面小）、慢网络/高延迟下的 UI 行为（loading 态、超时反馈）、声明超时归零时客户端 `DeadlineCountdown` 的展示行为——均无专属 e2e。
