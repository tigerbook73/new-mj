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
- [~] Phase 2：Lab export → production renderer 打通。
- [ ] Phase 3：桌面交互与视觉覆盖层。
- [ ] Phase 4：事件动画与全站体验统一。
- [ ] Phase 5：综合验收与收尾。

**当前状态**：手机横屏/竖屏不在桌面专题阶段内，待桌面收尾后重新评估。Phase 2 将把 Lab 导出的 preset 作为正式 Table 输入，并收敛为单一递归 Zone renderer，消除空透明 Zone 覆盖层。

**下一步第一个动作**：在用户确认本次重排后，为 Phase 2 建立实现检查点：先写 recursive `ZoneFrame → Service(children)` 的 renderer/交互回归测试，再开始改造正式 Table。

## 待办

- [ ] 部署 Supabase/应用，配置生产 OAuth 回调并验收。
- [ ] 桌面 Table UX 收尾后，基于 Zone/LayoutPreset 重新规划手机横屏/竖屏。
- [ ] 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- [ ] mobile 路线与 Expo 实现；日麻立项时复审 `architecture/variant-boundary.md`。
- [ ] 可选沉浸体验：音效、音量与静音设置。
