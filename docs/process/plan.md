# plan：项目状态与当前工作

> 本文件只保留项目基线、已完成能力、当前阶段与下一步。专题的范围、阶段目标和验收见 [`table-ux-plan.md`](./table-ux-plan.md)。过程细节在阶段收尾时清理，耐久结论进入 contracts、architecture 或 decisions。

## 项目基线

- Web + 移动端，支持多个麻将玩法、AI 与真人混桌和多局并行；当前优先完成垃圾胡桌面体验。
- Google/GitHub OAuth 已用本地 Supabase 和真实账号端到端验证；生产部署尚未开始。
- 规则只在 core，时间只在 server，身份只取握手，状态遵循 ack/事件契约；完整铁律见根 `AGENTS.md`。

## 已完成能力

TypeScript monorepo、垃圾胡/血战到底 RuleSet、CLI/replay/fuzz、多房间 server、AI 补位与断线托管、Web 登录/大厅/房间/牌桌、主题、对局归档与 Supabase OAuth 均已落地。Nest server 构建使用 SWC，类型检查仍由独立 `typecheck` 脚本负责。最近一次根目录 `pnpm verify` 于 2026-07-22 全绿，覆盖 format、typecheck、lint、build、unit、e2e，以及 core 的 junk 1000 局和 bloodbattle 10000 局 fuzz。

## 当前工作：Junk Table UX（桌面）

详见 [`table-ux-plan.md`](./table-ux-plan.md)。只完整验收 junk；bloodbattle 保持公共桌面骨架可用。

- [x] 基线：权威快照、声明超时、AI advice、桌面牌桌骨架。
- [x] Phase 1：Zone/LayoutPreset 几何层、桌面迁移、布局 Lab 与 JSON export。Phase 1a 已合入 `main`（`3beacb9`）；1b 已完成验证并 squash merge 到 `main`。
- [x] Phase 2：Lab export → production renderer 打通。
- [x] Phase 3：桌面交互与视觉覆盖层。
- [ ] Phase 4：布局重构与优化（具体内容待规划）。
- [ ] Phase 5：事件动画与全站体验统一。
- [ ] Phase 6：综合验收与收尾。

**当前状态**：手机横屏/竖屏不在桌面专题阶段内，待桌面收尾后重新评估。Phase 3 已完成完整 `myActionOptions`/seat-private 更新事件、独立 `action-dock` Zone（中文动作名、常驻候选区、hover 候选、单候选直提、多候选选项提交、AI 默认选中及胡/过/自摸上下文牌）、`TableView` 展示派生拆分、server 单步随机 AI 动作延迟，以及 Dock 的合法 AI recommendation/声明 deadline 展示；ActionDock Storybook 已提供多吃、胡/过、自摸审阅场景。吃/碰/明杠候选均直接复用 `lastDiscard` 显示并突出目标牌；吃按牌面顺序排列，碰/明杠从现有 `hand` 派生同牌面手牌并将目标牌固定在最后；暗杠展示四张手牌，补杠展示既有碰牌加本次补入牌，不扩充 PlayerView 接口。Dock 的面板边距、动作按钮、候选按钮/牌、字体与提示文字均以 action-dock Zone 的 container size 使用 `clamp()` 缩放。首次 hover 后保留最后查看的候选，避免移出 Dock 时消失（胡仅在从未 hover 前隐藏候选）。固定 seed 的真实 e2e 已覆盖 claim `pass` 与多组合 chi、候选 hover 持久选中、两个目标桌面视口、Enter/Space 键盘路径，以及 `hasTouch` context 下无 hover 状态的纯 tap 路径（单候选直提与多候选先展开后提交）。服务端拒绝错误会在 Dock 内作为 alert 显示。`autoPlayBots` 单步延迟调度已补齐结束局/离房/托管切换/声明 deadline 并存的针对性回归（fake-timer，`room.service.spec.ts`），Phase 3 收尾完成。

**下一步第一个动作**：规划 Phase 4（布局重构与优化）的具体范围与动机，与用户确认后再形成实现计划。

## 待办

- [ ] 部署 Supabase/应用，配置生产 OAuth 回调并验收。
- [ ] 桌面 Table UX 收尾后，基于 Zone/LayoutPreset 重新规划手机横屏/竖屏。
- [ ] 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- [ ] mobile 路线与 Expo 实现；日麻立项时复审 `architecture/variant-boundary.md`。
- [ ] 可选沉浸体验：音效、音量与静音设置。
