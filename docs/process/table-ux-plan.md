# Junk Table UX 计划

> 范围：只完成 junk 的桌面 Web 体验（1440×900、1366×768）。手机横屏/竖屏、bloodbattle 专属 UI 与音效不在本专题内。项目总状态见 [`plan.md`](./plan.md)。**本专题（Phase 1–6）已全部完成**，本文件按阶段收尾仪式（`../doc-map.md` §6）压缩为归档记录；后续同类专题（手机适配等）另开新的 `process/<phase 简称>.md`。

## 目标与既定边界

牌桌以 server 权威快照为最终状态；事件只驱动动画。合法动作和 AI 推荐均来自 server/core，客户端不重算规则；时间只由 server 处理。完整契约见 `../contracts/`、`../variants/junk.md` 和根 `AGENTS.md`。

## 已完成（归档）

- **基线**：权威逐动作快照、可配置声明超时、AI advice 数据链路、桌面牌桌骨架、Tile Storybook 与布局 Lab。
- **Phase 1/1b**：Zone/LayoutPreset schema、桌面 preset、Grid 等效几何、集中 registry；层级布局 Sketch（多 draft、变量、Grid、持久化、导入、JSON export）。已 squash merge 到 main（`3beacb9` 起）。
- **Phase 2**：正式 Table 直接消费 Sketch 导出的 desktop preset；递归 `ZoneFrame → Service(children)` renderer，每个 Zone 仅一个定位 DOM，运行时校验 registry 插槽。
- **Phase 3**：完整操作 Dock（`ActionDock`/`useTablePresentation`，动作名中文、候选区、hover/键盘/触屏可达性、AI recommendation 与 server deadline 展示）；`RoomService.autoPlayBots` 改为可取消的单步随机延迟调度，AI 动作带可感知停顿。真人与 AI 混桌可完成一局 junk，两个目标视口无滚动/裁切。
- **Phase 4**：`ActionDock` 改纯 CSS 百分比缩放 + SVG `<text>`（`ActionLabel`）+ 独立 `DeadlineCountdown` + 全局 Toaster；`TableBoard` 拆成框架层（`TableZoneContext`/`TableScenario`）+ 可替换场景（`scenarios/desktop.tsx`，为手机场景预留接口）；手牌/牌河/副露/座位信息全部去掉 JS 尺寸测量（`useMeasuredSize`/`fitTileGrid`/`TableGeometry.tsx` 已删除），改用纯 CSS 百分比 + `aspect-ratio`/`cqw`/`cqh`。
- **Phase 5（事件动画）**：出牌/摸牌/副露成型/结算四类事件动画统一走同一套 scaffold——`useIsIncrementalSnapshot`（`views/`）+ `usePrefersReducedMotion`（`hooks/`）在 `TableView.tsx` 组合成 `canAnimateEntries`，只对"活的、原地推进"的快照播放入场动画，reconnect/首次加载/reduced-motion 一律直接呈现终态。动画引擎是 `motion`（`motion/react`，见 `decisions.md` D31，含避坑记录）：`Tile.tsx`（出牌/摸牌/副露，`entering` prop 驱动 `initial`/`animate`）与 `RoundEndOverlay.tsx`（结算遮罩，`TableView.tsx` 用 `<AnimatePresence>` 包裹）。吃/碰/杠的"牌从牌河飞进副露"最终用的是 `ClaimFlipGhost.tsx`——一个只在认领那一刻挂载、测一次牌河源位置和副露落点、用 `createPortal` 渲染的临时克隆，播完自己卸载；牌河墓碑（`Tile.tsx`）和副露真实那张牌（`MeldGroup.tsx`）全程不受影响，各自的入场/变暗动画逻辑完全没改。这不是首选方案——先试过 motion 自带的 `layoutId` 共享布局 FLIP（牌河牌与副露牌共用一个 id），机制上真的能让副露那张牌飞过来，但会让牌河这张牌被 motion 隐式当成"正在退场"处理（自动淡出到 0 + `pointer-events:none`），跟牌河墓碑必须永久保留、只是变暗的既定设计（架构铁律 4）冲突，`layout="position"` 也压不住这个副作用，只能放弃、改成完全解耦的克隆方案。完整踩坑记录见 `decisions.md` D31。
- **Phase 6（综合验收）**：真人+AI混桌、刷新/断线恢复、reduced-motion 均有 e2e 覆盖；声明超时与结算的服务端行为由 `apps/server` 既有测试覆盖（`room.service.spec.ts`/socket.io-client 整局 e2e），`RoundEndOverlay` 的挂载/卸载动画因真实打满一局成本过高改用可交互 Storybook story + Playwright 截图验证（见 `decisions.md` D31 关联记录）；Replay 页面（`ReplayView.tsx`）与慢网络场景尚无专属 e2e，留作已知缺口，不阻塞本专题收尾。

验收记录：`pnpm --filter @new-mj/web verify` 与根目录 `pnpm verify`（含 core 的 junk 1000 局、bloodbattle 10000 局 fuzz）在 Phase 3–6 各自完成时均已跑绿；桌面视口（1440×900、1366×768）无页面滚动或关键内容裁切。

## Phase 6 收尾后追加的动画优化（用户提出，分阶段做）

范围：**1** 抓牌从桌面中心区域飞到手牌位置；**2A** 打牌时其余手牌收拢补位；**2B** 被打出的牌从手牌直接飞到牌河（最初想过中途在牌河区域中点放大停顿，用户实测后反馈不需要，见下）；**3** 跨区域动画尽量独立管理、不侵入基于状态的正常布局代码。按 2A → 1 → 2B 的顺序做（2A 风险最低最先做；2B 比 1 多一层"源头会真的消失、需要在点击那一刻提前测好起点"的复杂度，放最后）。**四项均已完成。**

- **2A 其余手牌收拢补位（已完成）**：`HandRow.tsx` 里手牌的 key 从纯 `index` 改成"钉住摸牌槽用 `drawnSlotKey`、真实揭示的手牌用 `` `tile-${tileId}` ``、其余（对手的匿名填充位、固定的空档位）用 `` `slot-${index}` ``"，让打出一张牌时只有那一个具体实例卸载，而不是后面每个格子"原地换脸"；`Tile.tsx` 新增 `reflow` prop 映射 motion 的 `layout`（跟 `layoutId` 无关，是"兄弟元素增删时自动补位"的标准用法，不是共享位置转移那一套，不会踩 `ClaimFlipGhost` 那次的坑），只在 `HandRow` 里使用，`DiscardPile`/`MeldGroup` 不受影响。**过程中抓到一个真 bug**：key 前缀化之前，`index` 和 `tileId` 共用同一数字空间，实测出现过一手牌里某张牌的 TileId 恰好等于空档格子的 index（如 `13`），触发 React 重复 key 警告、两个格子抢一个 DOM 节点——字符串前缀（`tile-`/`slot-`）从根上让两套 key 空间不可能相交，这是比"祈祷数值不会撞"更稳的做法，供以后任何"混用 index 和业务 id 做 key"的场景参考。用密集截图/`transform` 轨迹验证过：其余手牌确实平滑滑动补位，不是瞬间跳变。e2e 覆盖时发现校验窗口（600ms）在 `pnpm verify` 全量并发场景下不够用——点击到动画真正开始之间的延迟在重负载下会变长，挤占了留给动画本身播完的时间，放宽到 1500ms 后稳定。
- **1 抓牌从中心飞入（已完成，后经用户实测反馈简化两次）**：新增 `DrawFlipGhost.tsx`，跟 `ClaimFlipGhost.tsx` 同一套隔离原则（只在真正摸牌那一刻挂载一次、播完自己卸载、不碰真实钉住槽 Tile 的动画状态），但"起点"跟认领动画不一样——牌墙里的牌没有任何单独的视觉表示（架构上就没有逐张牌的 DOM 元素），没有真实的"源头元素"可测，所以起点用 `CenterStatus`（`table-center-status`）的**中心点**而不是某个具体元素的 rect。最初按"先扩大再回到正常大小"的字面要求做了 `[0.4, 1.4, 1]` 的放大过冲曲线（先缩小淡入、途中放大超过正常尺寸、最后回落定住），用户实测后反馈不需要放大过冲，改成 `[0.4, 1]` 直接从缩小状态长到正常大小；再次实测后用户反馈连这个"从小长大"也不需要，最终去掉全部 `scale` 动画，只保留位置飞入 + 透明度淡入，全程保持正常大小。自己摸牌显示真实牌面，对手摸牌显示牌背（复用 `Tile.tsx` 已有的"不传 `tileId` 即牌背"逻辑）。
- **2B 打牌飞出（已完成，后经用户实测反馈简化一次）**：手牌里被打出的那张牌会真的从数组消失（不是像牌河墓碑那样永久保留），等新快照渲染出来时源头元素已经不在了，测不到它的位置——解法是在点击那一刻（`HandRow.tsx` 的 `captureTileRect`，同步读一次 `getBoundingClientRect()`）就把这张牌的源头 rect 量好，随 `onDiscard(tile, originRect)` 一路带到 `TableView.tsx` 的 `pendingDiscardOrigin` state，再经 `useTablePresentation.ts` 按 TileId 匹配挂到对应的 `DiscardEntry.flightOrigin` 上，最终由 `DiscardPile.tsx` 新增的 `DiscardTileSlot` 包装组件在这张牌真正落地的那次挂载时读取一次、交给新的 `DiscardFlipGhost.tsx`。这纯粹是几何测量，不写任何游戏状态，也不依赖命令 ack——真正触发幽灵飞行的仍然是 server 权威快照落地那一刻，跟摸牌/认领动画完全同一套触发时机，不违反架构铁律 5。最初按"中途在牌河区域中点放大停顿"的要求做了三点关键帧（手牌位置 → `CenterStatus` 中心停顿放大 → 牌河终点位置回落），用户实测后反馈不需要中途停顿，改成跟 `ClaimFlipGhost` 完全一样的直接两点 rect-to-rect FLIP（手牌位置 → 牌河终点位置）。`pendingDiscardOrigin` 故意不做任何清空逻辑：TileId 全局唯一、一局内不会重复用到同一张牌，`DiscardTileSlot` 也只在这张牌真正挂载的那一次渲染读它一次，多余的旧值不读不用，放着也没有正确性或泄漏问题（反而是想在 `useEffect` 里清空会撞上本项目 `react-hooks/set-state-in-effect` 的 lint 规则，属于没必要解决的假问题）。**过程中顺带抓到一个 Stage 1 遗留的真 bug**：`HandRow.tsx` 的 `DrawnSlotTile` 给钉住摸牌槽包了一层 `<div className="h-full">` 用作 `DrawFlipGhost` 的落点 ref，但里面的 `Tile` 只占 `${tileHeightPct}%`（不是 100%）——wrapper 满高、内容不到满高、又没有自己的居中样式，导致这张牌贴着 wrapper 顶部，比其余手牌整体高了一截、不在同一条线上；`DiscardPile.tsx`/`MeldGroup.tsx` 的同款 wrapper 之所以没这个问题，是因为它们包的 `TileClaimSlot` 自己就是 `h-full`（满高包满高，不存在"更矮的内容飘在顶部"这一层）。修法是给 wrapper 补上 `flex items-center`，让它跟外层 `HandRow` 的行内对齐方式（同样是 `items-center`）保持一致。
- **3 独立管理原则（已完成，随 1/2A/2B 一并达成，不是单独的一步）**：`ClaimFlipGhost`/`DrawFlipGhost`/`DiscardFlipGhost` 三个飞行动画统一走同一套模式——真实的手牌/牌河/副露渲染逻辑完全不知道飞行动画的存在（`Tile.tsx`/`DiscardPile.tsx`/`MeldGroup.tsx`/`HandRow.tsx` 各自的入场/变暗/reflow 逻辑全程不因为"这次要不要飞"而改变一行），飞行效果全部由独立的、只在状态转换那一刻挂载一次、播完自毁的临时克隆元素负责，跟真实元素之间除了共享同一个 TileId 的牌面外没有任何状态耦合。

## 已知缺口（留给下一次触碰桌面 UX 时处理，不阻塞收尾）

- Replay 页面（`ReplayView.tsx`）没有专属 e2e——目前是 JSON-only 渲染，风险面小，但完全没有自动化覆盖。
- 慢网络/高延迟下的 UI 行为（loading 态、超时反馈）没有专属验证。
- 声明超时的**客户端**行为（deadline 真的归零时 UI 表现）没有从 web e2e 层面单独验证过——服务端超时代提交机制本身有覆盖，客户端只是纯展示 `DeadlineCountdown`，风险判断为低，但同样是纯展示未被自动化盯住的一个点。
