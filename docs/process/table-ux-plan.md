# Junk Table UX 计划

> 范围：只完成 junk 的桌面 Web 体验（1440×900、1366×768）。手机横屏/竖屏、bloodbattle 专属 UI 与音效不在本专题内。项目总状态见 [`plan.md`](./plan.md)。

## 目标与既定边界

牌桌必须以 server 权威快照为最终状态；事件只驱动动画。合法动作和 AI 推荐均来自 server/core，客户端不重算规则；时间只由 server 处理。完整契约见 `../contracts/`、`../variants/junk.md` 和根 `AGENTS.md`。

## 已完成（归档）

- 基线：权威逐动作快照、可配置声明超时、AI advice 数据链路、桌面牌桌骨架、Tile Storybook 与布局 Lab 均已完成并验证。
- Phase 1：Zone/LayoutPreset schema、桌面 preset、Grid 等效几何、集中 registry 与桌面迁移已完成；1a 已以 `3beacb9` 合入 main。
- Phase 1b：层级布局 Lab 已完成多 draft、变量、Grid、持久化、导入、JSON export 和浏览器回归，并已 squash merge 到 main。这是完成项，不再保留控件和实施步骤清单。
- Phase 2：正式 Table 已直接消费 Lab 导出的 desktop preset；递归 `ZoneFrame → Service(children)` renderer 使每个 Zone 仅有一个定位 DOM，并在运行时校验 registry 所需插槽。手牌、副露/信息 service 不再重建子 Zone 定位，桌面交互与两种目标视口回归已通过。

## 后续阶段

### Phase 3 — 桌面交互与视觉覆盖层

目标：完成一局 junk 所需的可见信息、操作与反馈。

- 完整操作 Dock：所有合法动作、组合选项、确认/禁用/错误反馈、键盘与触屏可达性。
- 接入一个合法 AI 推荐；展示 server deadline，普通出牌超时仍只由 server 代提交。
- AI/托管座位的每次自动动作由 server 单步随机延迟调度；人类动作后的 AI 摸牌与出牌、以及 AI 对 AI 的连续回合都保留可感知停顿。声明窗口仍以既有 server deadline 为准。
- 完成桌面视觉层级：玩家信息、中心状态、结算、离桌/设置/日志等覆盖层，并把关键视口回归纳入 e2e。

当前实施顺序：

1. 完成 `myActionOptions` 与 seat-private `LegalActionsUpdated` 的 core/protocol/rebuild 回归；保留 `myClaimOptions` 兼容语义，声明窗口的 `pass` 只属于完整动作列表。
2. 将桌面 `action-dock` 作为独立 preset Zone：无动作时 service 返回空且穿透；有动作时渲染半透明磨砂面板。已抽出 `ActionDock` 与 `useTablePresentation`，避免继续扩大 `TableView`。
3. 覆盖 Dock 的键盘/触屏可达性、`pass`、chi 多组合选择、错误反馈和两种桌面视口；已接入合法 AI recommendation 与 server deadline 展示，并以固定 seed 的真实 e2e 覆盖 `pass` 与 chi 组合提交、两个目标桌面视口、Enter/Space 键盘路径，以及 `hasTouch` context 下无 hover 状态的纯 tap 路径（单候选直提与多候选先展开后提交）。服务端拒绝错误会在 Dock 内作为 alert 显示。

Dock 交互约束：动作名使用中文（吃/碰/胡/杠/自摸/过）；上排按动作类型归组。下方候选区始终预留固定高度，默认展示 AI 推荐动作组（无推荐则第一组）的候选图形；hover 上排动作会切换展示组，指针移入候选区后不能收起。某类型仅有一个 server 下发的合法 action 时，上排动作或下方候选都可直接提交；同类型存在多个候选（例如多种吃或杠）时，上排只用于展开，必须点击一个具体候选才提交。每组默认选中 AI 推荐候选（该组无推荐则第一项）；hover 进入其他候选会持久改选中态，移出不回退。胡/过候选显示刚打出的牌，自摸候选显示刚摸的牌。候选区直接消费 server 给出的 action，不在客户端推导组合；Storybook 提供多吃、胡/过、自摸场景供视觉审阅。

4. 已将 `RoomService.autoPlayBots` 的同步循环改为可取消的单步随机延迟调度；每次 timer 触发后重新读取合法动作，AI 对 AI 亦逐步等待，并有 fake-timer 回归。已补齐结束、离房、托管切换与声明 deadline 并存的针对性回归（`room.service.spec.ts` 的 "bot auto-play timer interplay" 描述块）：结束局时清掉挂起的 bot timer 不再补发动作；离房/托管切换发生在 bot timer 挂起期间不会重复调度，且座位转自动打牌后无需人工输入即可续接；声明超时与 bot action timer 各自独立触发、互不干扰。

验收：真人与 AI 混桌可完成一局 junk，所有合法动作可操作，两个目标桌面视口无页面滚动或关键内容裁切。Phase 3 已完成。

### Phase 4 — 布局重构与优化

目标：布局重构与优化，具体范围随任务逐项确定；每项任务开工前先形成简要实现计划并由用户确认（同阶段门规则）。

当前实施顺序：

1. `ActionDock` 重构：内部由 CSS container-query + `clamp()` 曲线改为纯 CSS 百分比逐级缩放——ActionDock 自身垂直切上 Actions/下 Options 两区（默认 40/60，`tableLayoutLab.ts` 的 `TableLayoutConfig.actionDock` 新增分区可调），Actions 区按钮高度为区域高度的固定百分比、宽度按标签字数用 `aspect-ratio` 派生（1 字方形、2 字 1.4 倍宽），字体改用 SVG `<text>`（`ActionLabel` 组件，按钮/候选文字统一复用）按自身 viewBox 缩放，不再依赖 CSS `font-size` 或 container query；候选牌高度同样是 Options 区高度的固定百分比，宽度改用 `Tile.tsx` 已有的单维度 aspect-ratio 派生（不再和高度各自套一条 clamp 曲线导致比例失真）。声明倒计时从内联文字改成独立的 `DeadlineCountdown` 组件（纯数字徽标，绝对定位左上角，支持 UI-only 的 `onTimeout` 钩子但不接任何动作提交）。服务端拒绝错误从内联 `role="alert"` 改为全局 Toaster（shadcn `sonner`，`RootLayout.tsx` 挂载一次）。`action-dock` Zone 与候选/按钮的透明度、尺寸细节仍在人工调参中。ActionDock 的"推荐动作"后续改为不再有独立视觉：`recommendedAction` 只决定默认激活哪一组（`defaultGroup` 逻辑不变），按钮自身高亮态与候选区"选中"态统一用同一条"是否为当前 active 组"规则判断，hover 其他组会把高亮转移过去。

2. `TableBoard` 拆成框架层与可替换场景：`TableBoard.tsx` 只剩 `TableZoneContext`/`TableZoneComponent`/`TableScenario` 类型定义和 `ZoneRenderer` 接线，原来的 `switch(role)` 换成 `scenario.components[zone.id]` 直接查表；desktop 的全部 zone 组件绑定收进 `components/mahjong/scenarios/desktop.tsx` + `desktopZoneComponents.tsx`，`preset`+`components` 打包成一个 `TableScenario` 整体切换，为后续手机横竖屏场景（各自一份 preset JSON + 一份组件表）预留接口，本阶段未实现第二个场景。
   手牌/牌河/副露/座位信息四类子组件全部去掉 `useMeasuredSize`（ResizeObserver）/`fitTileGrid` 的 JS 尺寸测量，改用纯 CSS：`Tile.tsx` 支持只给 `heightPx`（含百分比字符串）、宽度靠 CSS `aspect-ratio` 派生；手牌区域收进单个 `SeatContent.handTiles: number[]`（+`revealed: boolean`）数组，固定以两个尾部占位（空档 + 摸到的牌或另一个空档）表达"钉住摸牌"，取代原来 `hand-content-*`/`hand-drawn-*` 两个独立 Zone 和已删除的 `HandTrack.tsx`/`handTrackContext.ts`；牌河从测量驱动的 CSS Grid 改成两级 flex（行不换行、列换行，无效 id 补齐末行对齐）；副露高度改成按 `meldTileHeightPct/meldHeightPct` 预算好的固定百分比；`InfoSlot` 旋转宽高互换与字号改用 `cqw`/`cqh` 容器查询单位（`DirectionalSurface` 已在用的同一技巧）。任意负数 TileId 在 `Tile.tsx` 统一渲染为不可见占位，不再单独定义手牌专用哨兵常量。
   顺带清理：`fitTileGrid`（`tableGeometry.ts`）、`useMeasuredSize.ts`、`TableGeometry.tsx`（`Ring`/`DirectionalSurface`，已被 Zone 自身 `rotationDeg` 取代但从未删除）、`PlayerBadge.tsx` 均已零调用方，连同 `MeldInfoTrack`/`CenterStatus` 里从未被覆盖的可选 prop 一并删除；修了一个牌河认领徽章因非正方形父盒渲染成椭圆的真 bug（`width/height:55%` 改成 `width:55%,aspect-ratio:1`，另发现 lucide 图标自带 `<svg width/height>` 会让只设一个 CSS 维度时 aspect-ratio 失效，需额外包一层无固有尺寸的 div），DiscardPile/MeldGroup 共用的部分抽成 `TileClaimSlot`；另修了 `HandRow` 一处把 `tileId` 条件性略去导致占位格误渲染成暗牌背景的 bug。

验收：`pnpm --filter @new-mj/web verify` 与根目录 `pnpm verify`（含 core 的 junk 1000 局、bloodbattle 10000 局 fuzz）均全绿。Phase 4 已完成。

### Phase 5 — 动画与全站体验统一

目标：在不改变权威状态语义的前提下提升反馈与一致性。

- 事件动画采用 authoritative/presented 双状态；支持 reduced-motion、重连和积压时直接追平。
- 将成熟的视觉 token、加载/空/错状态、Toast 与路由恢复推广到登录、游戏选择、大厅、房间和 Replay。

验收：动画不提前暴露下一权威状态；跨页错误恢复不显示裸协议错误；明暗主题与键盘路径可用。

### Phase 6 — 综合验收与收尾

目标：完成 junk 桌面端收尾。

- 覆盖真人 + AI、刷新/断线恢复、声明超时、结算、Replay、慢网络和 reduced-motion。
- 执行根目录 `pnpm verify`，按 `../doc-map.md` §6 吸纳耐久结论，清理本文件的阶段过程内容。
- 评估是否启动手机适配，并在 `plan.md` 写明下一专题的首个动作。

## 阶段门

每个阶段从最新 main 建分支；先形成并由用户确认当前阶段的简要实现计划，再实现与测试。阶段完成后运行定向检查和根 `pnpm verify`，更新本文件与 `plan.md`、提交并停止；未经用户明确指令不得 merge、推送或创建 PR。
