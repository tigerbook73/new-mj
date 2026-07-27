# plan：项目状态与当前工作

> 本文件只保留项目基线、已完成能力、当前阶段与下一步。复杂阶段的范围、目标和待办另立 `process/<phase 简称>.md`，由本文件当前工作区链接过去（见 `doc-map.md` §5）。过程细节在阶段收尾时清理，耐久结论进入 contracts、architecture 或 decisions。

## 项目基线

- Web + 移动端，支持多个麻将玩法、AI 与真人混桌和多局并行；当前优先完成垃圾胡桌面体验。
- Google/GitHub OAuth 已用本地 Supabase 和真实账号端到端验证；生产部署尚未开始。
- 规则只在 core，时间只在 server，身份只取握手，状态遵循 ack/事件契约；完整铁律见根 `AGENTS.md`。

## 已完成能力

TypeScript monorepo、垃圾胡/血战到底 RuleSet、CLI/replay/fuzz、多房间 server、AI 补位与断线托管、Web 登录/大厅/房间/牌桌、主题、对局归档与 Supabase OAuth 均已落地。**Junk Table UX（桌面）专题（Phase 1–6，含 Phase 6 收尾后追加的动画优化）已全部完成并收尾**：Zone/LayoutPreset 几何层设计见 `architecture/frontend-layout.md`，完整操作 Dock（真人+AI 混桌可玩）、纯 CSS 布局重构均已落地；出牌/摸牌/副露成型/结算四类事件动画与三条跨区域飞行动画（独立临时克隆、不侵入真实渲染逻辑）已落地并通过 e2e/Storybook 验收，动画技术选型与踩坑记录见 `decisions.md` D31；已知缺口见下方待办。bloodbattle 仍停留在公共桌面骨架（血战专属 UI 留待后续专题）。Nest server 构建使用 SWC，类型检查仍由独立 `typecheck` 脚本负责。最近一次根目录 `pnpm verify` 于 2026-07-26 全绿，覆盖 format、typecheck、lint、build、unit、e2e，以及 core 的 junk 1000 局和 bloodbattle 10000 局 fuzz。

## 当前工作：Table Layout Lab 增强及优化

Junk Table UX 专题（Phase 1–6，含收尾后追加的动画优化）已完全收尾并 squash-merge 进 main（`table-ux-phase5` 分支已完成使命，可删除）。当前工作在独立分支 `table-layout-lab-enhance` 上进行，进度与待办见该分支的 `docs/process/table-layout-lab-plan.md`（该分支尚未合并回 main）。

**下一步第一个动作**：切到 `table-layout-lab-enhance` 分支继续——嵌套 grid 与 World View 越界这两条待办，先挑一条开始复现分析，还是两条一起看，需要和用户对齐后再动工。

## 待办

- [ ] Table Layout Lab 增强及优化（当前工作，见 `table-layout-lab-enhance` 分支的 `table-layout-lab-plan.md`）。
- [ ] 部署 Supabase/应用，配置生产 OAuth 回调并验收。
- [ ] 基于 Zone/LayoutPreset 规划手机横屏/竖屏（Junk Table UX 收尾后可评估）。
- [ ] 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- [ ] mobile 路线与 Expo 实现；日麻立项时复审 `architecture/variant-boundary.md`。
- [ ] 可选沉浸体验：音效、音量与静音设置。
- [ ] Junk Table UX 已知缺口（不紧急）：Replay 页面（`ReplayView.tsx`，纯 JSON 渲染，风险面小）、慢网络/高延迟下的 UI 行为（loading 态、超时反馈）、声明超时归零时客户端 `DeadlineCountdown` 的展示行为——均无专属 e2e。
