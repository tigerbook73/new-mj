# Junk Table UX 计划

> 范围：只完成 junk 的桌面 Web 体验（1440×900、1366×768）。手机横屏/竖屏、bloodbattle 专属 UI 与音效不在本专题内。项目总状态见 [`plan.md`](./plan.md)。

## 目标与既定边界

牌桌必须以 server 权威快照为最终状态；事件只驱动动画。合法动作和 AI 推荐均来自 server/core，客户端不重算规则；时间只由 server 处理。完整契约见 `../contracts/`、`../variants/junk.md` 和根 `AGENTS.md`。

## 已完成（归档）

- 基线：权威逐动作快照、可配置声明超时、AI advice 数据链路、桌面牌桌骨架、Tile Storybook 与布局 Lab 均已完成并验证。
- Phase 1：Zone/LayoutPreset schema、桌面 preset、Grid 等效几何、集中 registry 与桌面迁移已完成；1a 已以 `3beacb9` 合入 main。
- Phase 1b：层级布局 Lab 已完成多 draft、变量、Grid、持久化、导入、JSON export 和浏览器回归，并已 squash merge 到 main。这是完成项，不再保留控件和实施步骤清单。

## 后续阶段

### Phase 2 — Lab export → production renderer

目标：让正式 Table 直接消费可由 Lab 导出的 `LayoutPreset`，并消除当前 Zone DOM 与业务组件重复定位的问题。

- `ZoneRenderer` 统一递归：每个 Zone 只生成一个 `ZoneFrame`；registry 命中时使用 `ZoneFrame → Service(children) → child ZoneFrame`，未命中时直接递归子 Zone。
- service 统一接收 `children`；父 service 用 Context 提供尺寸/交互状态，不得按子 Zone id 再创建定位 DOM；叶子 Zone 绑定对应业务内容。
- Game Page 显式把 desktop preset 传给 `TableBoard`；JSON 保持纯几何，运行时校验 Zone 与 registry 插槽。

验收：无空透明覆盖层；手牌 hover/click、中心操作和 DevTools 命中正常；两种桌面视口与既有 junk/bloodbattle 回归通过。

### Phase 3 — 桌面交互与视觉覆盖层

目标：完成一局 junk 所需的可见信息、操作与反馈。

- 完整操作 Dock：所有合法动作、组合选项、确认/禁用/错误反馈、键盘与触屏可达性。
- 接入一个合法 AI 推荐；展示 server deadline，普通出牌超时仍只由 server 代提交。
- 完成桌面视觉层级：玩家信息、中心状态、结算、离桌/设置/日志等覆盖层，并把关键视口回归纳入 e2e。

验收：真人与 AI 混桌可完成一局 junk，所有合法动作可操作，两个目标桌面视口无页面滚动或关键内容裁切。

### Phase 4 — 动画与全站体验统一

目标：在不改变权威状态语义的前提下提升反馈与一致性。

- 事件动画采用 authoritative/presented 双状态；支持 reduced-motion、重连和积压时直接追平。
- 将成熟的视觉 token、加载/空/错状态、Toast 与路由恢复推广到登录、游戏选择、大厅、房间和 Replay。

验收：动画不提前暴露下一权威状态；跨页错误恢复不显示裸协议错误；明暗主题与键盘路径可用。

### Phase 5 — 综合验收与收尾

目标：完成 junk 桌面端收尾。

- 覆盖真人 + AI、刷新/断线恢复、声明超时、结算、Replay、慢网络和 reduced-motion。
- 执行根目录 `pnpm verify`，按 `../doc-map.md` §6 吸纳耐久结论，清理本文件的阶段过程内容。
- 评估是否启动手机适配，并在 `plan.md` 写明下一专题的首个动作。

## 阶段门

每个阶段从最新 main 建分支；先形成并由用户确认当前阶段的简要实现计划，再实现与测试。阶段完成后运行定向检查和根 `pnpm verify`，更新本文件与 `plan.md`、提交并停止；未经用户明确指令不得 merge、推送或创建 PR。
