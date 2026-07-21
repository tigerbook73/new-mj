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

- [x] 现状基线：协议/快照/声明超时/AI advice 数据链路 + 桌面视觉骨架（详见 `table-ux-plan.md` §4，merge commits `18416f9`/`39f93b2`/`9a5d254`/`cda9286`）
- [x] Phase 1：几何数据层 + 桌面迁移（1b 布局工具由用户后续自行规划，不阻塞本阶段）
- [ ] Phase 2：视觉与覆盖层
- [ ] Phase 3：桌面视口回归验收
- [ ] Phase 4：完整操作 Dock 与 AI 推荐
- [ ] Phase 5：事件驱动牌桌动画
- [ ] Phase 6：全站视觉与体验统一
- [ ] Phase 7：综合验收与计划收尾（Junk Table UX 桌面端收尾）

**当前状态**：本专题改为**先做完桌面端完整功能，手机横屏/竖屏移出阶段序列、转入下方待办**（原 Phase 2/3"手机横屏/竖屏"与 Phase 5 里覆盖 844×390/390×844 的部分已从 `table-ux-plan.md` 删除）。同时放弃原计划里"每个 layoutMode 各自摸索一套扁平 config、最后再回头统一"的做法——手机横屏 chrome 的详细设计（`feat/table-layout-landscape` 分支上的 draft lab 探索）投入产出比不划算，已删除；改为参考 `../architecture/frontend-layout.md`（吸纳自 `multi-screen-refactor.md` 讨论稿，原文已删除）提出的 Zone/LayoutPreset schema。分支上跟横屏无关但有价值的 `inlineInsetPct`（`HandTrack`/`MeldInfoTrack` 透传给 `DirectionalSurface` 的已有能力）已保留，分支改名为 `feat/table-layout-schema`。`decisions.md` 新增 D30（离散 layoutMode 判定标准）。`table-ux-plan.md` 已整体重写：已完成部分压缩为 §4 现状基线，阶段编号从 1 重新开始，Phase 7（综合验收）通过即视为 Junk Table UX 桌面端完整收尾。

**当前状态**：Phase 1 已在 `feat/table-layout-schema` 完成并提交，等待用户明确 merge 指令；Step 0 与 Step 1a 均已完成，1b 按用户要求留待其自行规划。2026-07-21 已通过 `pnpm --filter @new-mj/web verify`（33 unit、28 Playwright、build、Storybook）与根目录 `pnpm verify`（format/typecheck/lint/build/unit/e2e 全绿）。

**下一步第一个动作**：等待用户明确指令，将 `feat/table-layout-schema` squash merge 到 `main`；合并后回填 Merge commit，并为 Phase 2 做详细计划与确认检查点。

## 待办

- [ ] 正式云端部署 Supabase/应用，配置生产环境变量与 Google/GitHub OAuth 回调地址并做部署后验收。
- [ ] Junk Table UX 手机横屏/竖屏适配：Table UX 计划桌面端（Phase 1-7）全部完成后再评估是否启动；届时基于 `../architecture/frontend-layout.md` 的 Zone/LayoutPreset schema 与 Phase 1 产出的布局工具重新写详细计划，预期步骤比原来手搓 chrome 精简。
- [ ] 血战到底 Table 专属体验：换三张、定缺、血战状态与完整操作 UI。
- [ ] mobile 路线与 Expo 实现（是否复用 react-native-web 另行决定）。
- [ ] 日麻立项时按 `../architecture/variant-boundary.md` §2 复审庄家轮换公式与会话排名策略。
- [ ] 真人协作触发时确认 repo 权限与分支保护。
- [ ] 可选沉浸体验：麻将音效、音量与静音设置（不属于当前 Table UX 计划）。
