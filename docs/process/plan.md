# plan：项目状态与当前工作

> 过程性文档：只维护项目基线、已完成能力、当前工作与待办。复杂实施方案单独放在 `process/` 下的主题计划中；阶段完成后按 `../doc-map.md` §6 吸纳耐久结论并清理过程细节。

## 项目基线

- Web + 移动端，支持多个麻将玩法、AI 与真人混桌和多局并行。
- 当前先把垃圾胡打磨为完整产品体验，再推进血战到底和 mobile。
- Google/GitHub 登录；架构保持可扩展，但不为非商用项目承担数据兼容和迁移成本。
- 规则只在 core，时间只在 server，身份只取握手，状态遵循 ack/事件契约；完整铁律见根 `AGENTS.md`。

## 已完成能力

项目已具备 TypeScript monorepo、垃圾胡与血战到底纯函数 RuleSet、CLI/replay/fuzz、NestJS + Socket.IO 多房间服务、AI 补位与断线托管、Web 登录/大厅/房间/牌桌、明暗主题、对局 Replay、PG 对局归档与重启后读取，以及 Supabase OAuth 双路径鉴权。账号 profile/avatar、开发态伪账号、单账号连接仲裁、60 秒断线恢复、server-truth 房间恢复与被 AI 永久接管后的只读围观均已落地。耐久契约与设计理由见 `../contracts/`、`../variants/`、`../architecture/` 和 `../decisions.md`。

真实 Google/GitHub OAuth 已通过本地 Supabase 容器使用真实账号完成端到端验证；尚未正式部署到云端。

最近一次根目录 `pnpm verify` 于 2026-07-20 全绿：format/typecheck/lint/build/unit/e2e 全部通过；web Playwright 28 条、server e2e 21 条通过，core 包含 1000 局 junk 与 10000 局 bloodbattle fuzz。

## 当前工作：Junk Table UX

详细方案与阶段验收记录见 [`table-ux-plan.md`](./table-ux-plan.md)。本专题只完整验收垃圾胡；bloodbattle 保持公共骨架可用，专属玩法 UI 留在待办。

- [x] Phase 0：计划文档重置
- [x] Phase 1：权威逐动作快照
- [x] Phase 2：可配置声明窗口超时
- [x] Phase 3：AI Advice 数据链路
- [~] Phase 4：视觉基础与响应式 Table 骨架（P4.1 已验收合并，P4.2 手机横屏待制定详细计划）
- [ ] Phase 5：完整操作 Dock 与 AI 推荐
- [ ] Phase 6：事件驱动牌桌动画
- [ ] Phase 7：全站视觉与体验统一
- [ ] Phase 8：综合验收与计划收尾

**当前状态**：Phase 3 已本地 squash merge 为 `9a5d254`，merge tracker 提交为 `d2a6bba`；Phase 4 使用五个独立 branch、逐一合并确认。P4.1 桌面横屏（手牌排序、Tile Storybook、开发专用 Layout Lab、接入正式 Table、`justDrawn` 摸牌钉住列、round-end 确认门等全部子步骤）已在浏览器完成人工验收（真实四人开局，1440×900/1366×768 视口检查手牌区/副露+玩家信息区/摸牌钉住列），2026-07-20 本地 squash merge 到 `main` 为 `cda9286`，`feat/table-layout-desktop` 已合并完成。`PlayerBadge` 全量信息（头像/庄家/托管/比分）尚未迁入新信息列，留作后续任务。

**下一步第一个动作**：从最新本地 `main` 创建 `feat/table-layout-landscape` branch，制定 P4.2（手机横屏）详细计划——保留四家方位，按高度约束桌面核心，利用左右余量承载紧凑信息；计划提交后暂停，等待用户确认再开始实现。

## 待办

- [ ] 正式云端部署 Supabase/应用，配置生产环境变量与 Google/GitHub OAuth 回调地址并做部署后验收。
- [ ] 血战到底 Table 专属体验：换三张、定缺、血战状态与完整操作 UI。
- [ ] mobile 路线与 Expo 实现（是否复用 react-native-web 另行决定）。
- [ ] 日麻立项时按 `../architecture/variant-boundary.md` §2 复审庄家轮换公式与会话排名策略。
- [ ] 真人协作触发时确认 repo 权限与分支保护。
- [ ] 可选沉浸体验：麻将音效、音量与静音设置（不属于当前 Table UX 计划）。
