# 前端布局架构：几何数据、渲染场景与展示逻辑

> 范围仅限 web 牌桌。本文记录当前已落地的桌面架构和仍未决定的跨屏策略；调参值、编辑器草稿与实现过程不在这里保存。

## 1. 边界

麻将桌是空间化 UI：座位、手牌、弃牌区的位置本身携带语义，不能把桌面设计简单压缩成流式卡片布局。因此每个 `layoutMode` 应有独立的参考画布和区域配置；横竖屏不是把同一画布旋转 90 度。

这不决定 Expo/mobile 是否与 web 共用渲染实现；该产品/技术选择仍在 `process/plan.md` Backlog。

## 2. 当前三层

- **几何数据**：`src/shared/lib/layoutPreset.ts` 定义并校验 `LayoutPreset`/`Zone`。Zone 描述中心锚点、本地尺寸、四分之一旋转、可见性和父子关系，不携带业务数据或 React 组件。
- **场景渲染**：`ZoneRenderer` 递归把 Zone 转成定位容器。`features/mahjong/components/TableBoard.tsx` 将 preset 与按稳定 `zone.id` 绑定的场景组件打包为 `TableScenario`；桌面场景在 `components/scenarios/desktop.tsx`。业务组件可包裹 `children`，但不得重建子 Zone 的定位层。
- **展示逻辑**：`features/mahjong/TableView.tsx` 和 `useTablePresentation.ts` 从权威 `PlayerView` 派生可渲染数据；展示组件只接收数据和回调，不重新判断玩法规则或直接调用协议。

游戏领域状态留在 `shared/store/session.ts`；纯展示偏好留在 `features/mahjong/tableLayout.store.ts`，两者不混合。

## 3. Zone 模型与布局文件

`Zone` 使用父级未旋转的局部坐标；`rotationDeg` 只允许 `0 | 90 | 180 | -90`，`visible` 缺省为 `true`。父子结构保留旋转和层叠上下文，避免把每个子项拍平后重复计算坐标。

- 桌面布局文档：`src/features/mahjong/layouts/desktop.table-layout.json` 同时保存 `LayoutPreset` 几何和桌面展示 Config；可由 Layout Sketch 读写。
- 展示参数：`src/features/mahjong/desktop.table-config.ts` 只从布局文档导入并以 `TableLayoutConfig` 校验后导出，避免与 JSON 形成双真源。Config 只供真实桌面组件消费，不属于通用 `LayoutPreset` 几何契约。
- 编辑器：`src/features/layout-sketch/` 仅开发态注册；草稿/变量/辅助 Grid 服务于编辑和 round-trip，不是生产运行时依赖。Variables 仅服务几何表达式；Config Panel 只编辑真实组件的展示参数，两者不互相引用。Lab 的可见性设置保存于 editor metadata，Preview 将其映射到 Zone；生产 root 导出始终为 `visible: true`。

文档内仍将通用 Zone 几何与桌面展示 Config 分层：新布局可替换几何，而不把牌桌业务参数或编辑器元数据耦合进通用 schema。

## 4. 座位与区域组合

座位 Zone 使用容器旋转，子内容在同一局部坐标系内排布。牌面是否反向旋转以保持正读是产品决定，不是当前 schema 的限制。

Tile、ActionButton 等展示原子可跨场景复用；不同屏幕下“怎样组合原子”（四家独立牌河或合并牌河）由场景组件决定。不要为尚未出现的场景预建动态拼装引擎。

## 5. 动画边界

动画只影响观感，最终状态始终以 `game:snapshot` 为准；任何新动画都不能读取/修改规则状态，也不能以 `game:event` 重建视图（`game:event` 只作诊断日志，snapshot 是唯一视图权威来源）。

- **Tile 三层拆分**：`components/Tile.tsx` 组合 `TileSlot`（恒定尺寸+占位格分支）→ `TileMotion`（动画壳，携带 e2e 依赖的 `data-testid`/`data-tile-id`/`data-entering`，`prefers-reduced-motion` 时降级为纯 `div`）→ `TileFace`（图片/点击/`dimmed`/`enlarged`，全部纯 CSS）。`dimmed`/`enlarged` 必须落在非 motion 节点：挂在 motion 节点上会被它每次渲染写回的内联 transform/opacity 覆盖，CSS class 天生打不过。
- **动画调度**：`lib/diffPlayerView.ts`（纯函数，diff 两份 `PlayerView` 产出摸牌/弃牌/副露的槽位事件；key 统一用"局号+座位+数组下标"、不用牌值——两个 ruleset 的 discards/melds 数组都只增不减，下标身份稳定，也避免对手动效的 key 携带可反查牌面的 TileId，铁律2）→ `lib/animationLedger.ts`（模块级单例，把槽位解析为 `flight`/`appear`/`skip`；同座位摸牌槽是唯一的结构性冲突降级点，弃牌/副露不设积压阈值）→ `lib/useSlotEntering.ts`（消费侧 hook，只在组件挂载时读一次解析结果，之后不再读）。写入必须在 `TableView.tsx` 的 `game:snapshot` 处理器里、`applyGameSnapshot` 换 `view` 之前同步执行。
- **跨区域飞行**：摸牌/出牌/认领统一走独立临时 ghost（`components/useFlightGhost.ts`：测量一次 rect → portal 到 `document.body` → 播完自毁），从不让真实业务节点（牌河墓碑、副露牌、待摸槽位）承担跨容器动画或被这层触碰。不用 `layoutId` 共享布局——墓碑永不卸载，隐式共享布局会把它当成正在退场，和自身的 `dimmed` 目标打架（具体机制见 `ClaimFlipGhost.tsx`）。对手弃牌的飞行（`OpponentDiscardFlipGhost.tsx`）从其整个手牌区起飞，不追踪某张具体手牌——对手手牌背面不携带可用于溯源的身份，铁律2同样适用。

## 6. 未来工作与验证方式

- 手机横屏/竖屏应先建立一个最小场景：手写 preset、由正式 `TableBoard` 消费、验证一个典型对局；通过后再扩展编辑器能力。
- 若布局编辑工具未来改变正式产物或被多个场景复用，应作为独立的使能 slice，按 `process/workflow.md` 的重估规则推进，而不是嵌入某个 UI slice。
- 设备运行中切换方向、牌面是否正读，均为尚未决定的产品问题；决定后再补相应视觉/e2e 验收。
- `TableBoard`/`TableZoneContext` 的 `center`/`actionDock` 是具名 `ReactNode` prop，不像 `seats`/`discards` 那样按 `zone.id` 泛化：它们装的是 `TableView` 自己的会话状态（phase、actions、`onAction` 等），本就不该塞进跨场景稳定的 `TableZoneContext` 契约。代价是每新增一个单实例展示 zone（如未来的计分板、剩余牌数徽章）都要再加一个具名字段，直接改 `TableBoard.tsx` 的两处接口和函数体，而不是像其他 zone 一样纯靠 `desktop.tsx` 注册表加一行搞定。目前只有这两个 slot，都稳定在用，暂不因此改造；等真的出现第三个单实例 zone 时，再新增一个 `extraSlots?: Record<string, ReactNode>` 承接（不动 `center`/`actionDock` 已有字段），由场景注册表按 `zone.id` 取用。
