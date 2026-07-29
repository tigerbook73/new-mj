# 前端布局架构：几何数据、渲染场景与展示逻辑

> 范围仅限 web 牌桌。本文记录当前已落地的桌面架构和仍未决定的跨屏策略；调参值、编辑器草稿与实现过程不在这里保存。

## 1. 边界

麻将桌是空间化 UI：座位、手牌、弃牌区的位置本身携带语义，不能把桌面设计简单压缩成流式卡片布局。因此每个 `layoutMode` 应有独立的参考画布和区域配置；横竖屏不是把同一画布旋转 90 度。

这不决定 Expo/mobile 是否与 web 共用渲染实现；该产品/技术选择仍在 `process/plan.md` Backlog。

## 2. 当前三层

- **几何数据**：`src/shared/lib/layoutPreset.ts` 定义并校验 `LayoutPreset`/`Zone`。Zone 只描述中心锚点、本地尺寸、四分之一旋转和父子关系，不携带业务数据或 React 组件。
- **场景渲染**：`ZoneRenderer` 递归把 Zone 转成定位容器。`features/mahjong/components/TableBoard.tsx` 将 preset 与按稳定 `zone.id` 绑定的场景组件打包为 `TableScenario`；桌面场景在 `components/scenarios/desktop.tsx`。业务组件可包裹 `children`，但不得重建子 Zone 的定位层。
- **展示逻辑**：`features/mahjong/TableView.tsx` 和 `useTablePresentation.ts` 从权威 `PlayerView` 派生可渲染数据；展示组件只接收数据和回调，不重新判断玩法规则或直接调用协议。

游戏领域状态留在 `shared/store/session.ts`；纯展示偏好留在 `features/mahjong/tableLayout.store.ts`，两者不混合。

## 3. Zone 模型与布局文件

`Zone` 使用父级未旋转的局部坐标；`rotationDeg` 只允许 `0 | 90 | 180 | -90`。父子结构保留旋转和层叠上下文，避免把每个子项拍平后重复计算坐标。

- 桌面布局文档：`src/features/mahjong/layouts/desktop.table-layout.json` 同时保存 `LayoutPreset` 几何和桌面展示 Config；可由 Layout Sketch 读写。
- 展示参数：`src/features/mahjong/desktop.table-config.ts` 只从布局文档导入并以 `TableLayoutConfig` 校验后导出，避免与 JSON 形成双真源。Config 只供真实桌面组件消费，不属于通用 `LayoutPreset` 几何契约。
- 编辑器：`src/features/layout-sketch/` 仅开发态注册；草稿/变量/辅助 Grid 服务于编辑和 round-trip，不是生产运行时依赖。Variables 仅服务几何表达式；Config Panel 只编辑真实组件的展示参数，两者不互相引用。

文档内仍将通用 Zone 几何与桌面展示 Config 分层：新布局可替换几何，而不把牌桌业务参数或编辑器元数据耦合进通用 schema。

## 4. 座位与区域组合

座位 Zone 使用容器旋转，子内容在同一局部坐标系内排布。牌面是否反向旋转以保持正读是产品决定，不是当前 schema 的限制。

Tile、ActionButton 等展示原子可跨场景复用；不同屏幕下“怎样组合原子”（四家独立牌河或合并牌河）由场景组件决定。不要为尚未出现的场景预建动态拼装引擎。

## 5. 动画边界

动画只影响观感，最终状态始终以 `game:snapshot` 为准。当前实现：

- 手牌/新条目使用 Motion 的局部入场或 reflow 动画；`prefers-reduced-motion` 会禁用它们。
- 摸牌、出牌、认领的跨区域运动由 `DrawFlipGhost`、`DiscardFlipGhost`、`ClaimFlipGhost` 创建独立临时克隆并测量两端 rect；不让真实业务节点承担跨容器动画。
- 不使用 `layoutId` 在牌河墓碑与副露之间共享布局：墓碑不卸载，隐式共享布局会产生错误退场语义。

任何新动画都不能读取/修改规则状态，也不能以 `game:event` 重建视图；事件目前只作为诊断日志，snapshot 是唯一视图权威来源。

## 6. 未来工作与验证方式

- 手机横屏/竖屏应先建立一个最小场景：手写 preset、由正式 `TableBoard` 消费、验证一个典型对局；通过后再扩展编辑器能力。
- 若布局编辑工具未来改变正式产物或被多个场景复用，应作为独立的使能 slice，按 `process/workflow.md` 的重估规则推进，而不是嵌入某个 UI slice。
- 设备运行中切换方向、牌面是否正读，均为尚未决定的产品问题；决定后再补相应视觉/e2e 验收。
