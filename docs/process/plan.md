# 项目状态与当前工作

> 工作台，不是项目年表。只保留当前专题、会阻塞它的风险和有序 Backlog；完成专题压成一行，耐久结论分流到 contracts 或 architecture。

## 当前工作

**专题：生产部署与 OAuth 验收**

- 结果：部署 Supabase 与应用，配置生产 OAuth 回调并完成一次真实登录验收。
- 下一步第一个具体动作：确认目标部署平台与生产 Supabase 项目的环境变量、回调 URL 清单。

## 当前风险 / 开放问题

- 尚未选择并配置生产部署环境；不能把本地 Supabase 的 OAuth 验收视为生产验收。

## Backlog

- 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- 基于 Zone/LayoutPreset 规划手机横屏/竖屏；mobile 路线与 Expo 实现。
- 日麻立项时复审 `architecture/variant-boundary.md`。
- 可选沉浸体验：音效、音量与静音设置。
- Junk Table UX 的非紧急缺口：Replay 的牌面渲染、慢网络反馈、声明超时归零时的 `DeadlineCountdown` 行为及相应 e2e。

## 已完成摘要

- 核心与服务端：junk/bloodbattle RuleSet、CLI/replay/fuzz、多房间、AI 补位/断线托管、归档与持久化已落地。
- Web 与认证：登录、大厅、房间、Junk 可玩牌桌、Replay、主题与 Supabase Google/GitHub OAuth 已完成；房主在等待房间 ready 时客户端会以已 ready 的 AI 自动补满空座位；OAuth 已在本地 Supabase 以真实账号端到端验证。
- Junk Table UX 与 Layout Sketch：桌面 Zone/LayoutPreset、操作 Dock、CSS 布局、事件/跨区域动画、布局编辑与保存读取均已完成并经 e2e/Storybook 验收；bloodbattle 仍只有公共桌面骨架。
- 摸牌显式化：junk/bloodbattle 的摸牌从 core 内联副作用变成显式 `{type:"draw"}` 动作，server 按 `drawRevealDelayMs` 自动代提交，为 UI 留出真实的摸牌停顿窗口；零协议改动，三个 slice（core/server/web）均已验证并合入 main。
- 文档体系：已取消独立 decisions 文档；架构取舍归入 architecture/contracts，局部实现理由归代码注释或 package AGENTS。
- 最近一次根目录 `pnpm verify`：2026-07-28 全绿（含 format、typecheck、lint、build、unit、e2e；core junk 1000 局与 bloodbattle 10000 局 fuzz）。
