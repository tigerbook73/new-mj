# 项目状态与当前工作

> 工作台，不是项目年表。只保留当前专题、会阻塞它的风险和有序 Backlog；完成专题压成一行，耐久结论分流到 contracts 或 architecture。

## 当前工作

**专题：生产部署与 OAuth 验收**

- 结果：部署 Supabase 与应用，配置生产 OAuth 回调并完成一次真实登录验收。
- 下一步第一个具体动作：确认目标部署平台与生产 Supabase 项目的环境变量、回调 URL 清单。

## 当前风险 / 开放问题

- 尚未选择并配置生产部署环境；不能把本地 Supabase 的 OAuth 验收视为生产验收。
- 已发现（与本次改动无关，未修复）：`apps/web/test/lobby.e2e-spec.ts` 的 "leaving an in-game room keeps the other human in the match" 与 "force exiting an in-game room ends the session for every player" 两个用例在跑完整 `test/lobby.e2e-spec.ts` 套件时容易超时（等待对话框里的 "Hand off to AI"/"Force exit" 按钮），单独跑或小范围跑均能稳定通过；已在纯净 main（无本次任何改动）上复现，确认是套件层面的既有抖动，不是本次引入的回归。谁下次碰 leave-room/force-exit 相关代码时应该顺手看一眼。
- `hangzhou.md` §14 记录了两处不阻塞定稿的实现细节假设（财神替代数量上限、`caiPiaoCount` 中途清零与否），已按文档默认值实现并写入 fixture；如果和你的预期不符，后续只需改一行。

## Backlog

- 杭州麻将：三牢点炮限制 + 连庄坐庄——需要先定跨局状态传递的契约（庄家连续坐庄次数如何进入下一局 config），立项时复审 `architecture/variant-boundary.md` 庄家轮换公式行。
- 杭州麻将专属桌面体验：财神高亮、爆头/财飘状态展示（参照血战到底 UI 专题现状）。
- 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- 基于 Zone/LayoutPreset 规划手机横屏/竖屏；mobile 路线与 Expo 实现。
- 日麻立项时复审 `architecture/variant-boundary.md`（会话排名策略行；庄家轮换公式行视杭州三牢专题是否已先行验证而定）。
- 可选沉浸体验：音效、音量与静音设置。
- Junk Table UX 的非紧急缺口：Replay 的牌面渲染、慢网络反馈、声明超时归零时的 `DeadlineCountdown` 行为及相应 e2e。
- Bot 功能增强：提升 AI 补位/断线托管的出牌质量（杭州财神策略大概率是新的痛点来源）。
- 配置功能：允许垃圾胡（junk）开启不同规则变种。

## 已完成摘要

- 核心与服务端：junk/bloodbattle RuleSet、CLI/replay/fuzz、多房间、AI 补位/断线托管、归档与持久化已落地。
- Web 与认证：登录、大厅、房间、Junk 可玩牌桌、Replay、主题与 Supabase Google/GitHub OAuth 已完成；房主在等待房间 ready 时客户端会以已 ready 的 AI 自动补满空座位；OAuth 已在本地 Supabase 以真实账号端到端验证。
- Junk Table UX 与 Layout Sketch：桌面 Zone/LayoutPreset、操作 Dock、CSS 布局、事件/跨区域动画、布局编辑与保存读取均已完成并经 e2e/Storybook 验收；bloodbattle 仍只有公共桌面骨架。
- Layout Lab 真实 Preview：`desktop.table-layout.json` 已统一 Zone 几何与展示 Config，Config Panel 可保存草稿；正式桌面与多样例 Preview 复用同一渲染场景，`pnpm verify` 全绿。
- 摸牌显式化：junk/bloodbattle 的摸牌从 core 内联副作用变成显式 `{type:"draw"}` 动作，server 按 `drawRevealDelayMs` 自动代提交，为 UI 留出真实的摸牌停顿窗口；零协议改动，三个 slice（core/server/web）均已验证并合入 main。
- Web 牌桌动画重构：Tile 三层拆分（Slot/Motion/Face）+ 全桌动画调度架构（`diffPlayerView`/`animationLedger`/`useSlotEntering`，含对手弃牌飞行 ghost）已完成并合入本分支，`pnpm --filter @new-mj/web verify` 全绿；耐久结论已分流到 `architecture/frontend-layout.md` §5，专题 brief 已删除。
- 文档体系：已取消独立 decisions 文档；架构取舍归入 architecture/contracts，局部实现理由归代码注释或 package AGENTS。
- 开发流程：slot 化 worktree 现由私有 `@new-mj/devtools` 统一供根创建器、Vite 与 Playwright 使用；创建时自动分配空闲 slot、链接主 worktree 中全部被忽略的根 `.env.*`，并提供 status/doctor。标准 `pnpm dev`、`pnpm test:e2e` 与 `pnpm verify` 自动使用当前 slot，E2E 每 worktree 单 worker。
- 牌局 UI/结算功能：牌局中隐藏 Sign out；Leave room 改为始终确认，二选一"托管"（原有行为）/"强制退出"（新增 `room:end` 消息 + `RoomService.endSession`/`finishSession`，任意在座玩家可立即结束整场对局进入结算，无需他人确认）；局间确认界面新增"结束"按钮复用同一能力；`InfoLabel` 改名 `ScaleText` 并用于 `CenterStatus`；新房间默认每人 1000 积分，结算画面重写为正式 UI（排名/最终积分/冠军标记/局数/Replay 链接）。`session-mechanics.md` 已同步；server/web 均已补测试。
- 杭州麻将 RuleSet：`packages/core/src/rulesets/hangzhou/` 完整实现四签名 + 财神代打胡牌（基本型/七对+豪华判定）、爆头/财飘派生状态、杠链番组，`registered-rulesets.ts` 已登记进跨玩法不变量测试；`docs/variants/hangzhou.md` 定稿（三牢点炮/连庄坐庄明确排除，见 Backlog）；单测/fixture/1000 局回归 fuzz 随 `pnpm test` 跑，另跑过一次 10000 局收尾验证均无失败；`apps/web` 的 `GamePickerView` 已能创建杭州房间（公共桌面骨架，同血战到底现状）。
- 最近一次根目录 `pnpm verify`：2026-07-31 全绿（含 format、typecheck、lint、build、unit、e2e；core junk 1000 局与 bloodbattle 10000 局 fuzz）；本次杭州收尾时 `pnpm verify` 除 §当前风险 记录的既有 e2e 抖动外全绿。
