# 麻将桌动画重构：Tile 三层拆分 + 全桌动画调度架构

> 临时专题文档（`doc-map.md` 分流规则）。完成后只在 `process/plan.md` 留一行完成摘要，耐久结论分流到 `architecture/frontend-layout.md`（动画边界一节）后本文件删除。

## Context

这次重构从"Tile 组件内部实现和动画耦合"这个具体问题出发，逐步扩大到"整桌动画策略"的重新设计。两部分目标不同但接口兼容，可以独立落地：

- **第一部分（Tile 三层拆分）**解决的是：Tile 组件同时承担定尺寸/渲染牌面/驱动 motion 动画三件事，导致 `dimmed`/`enlarged` 这些"状态"必须塞进 motion 的 `animate` 才能生效（CSS class 会被 motion 写的内联样式覆盖），基础展示和动画耦合在一起，动画没法独立开发/关闭。
- **第二部分（动画调度架构）**解决的是：现在"要不要播入场动画"分散在 `useTablePresentation.ts` 的一次性字段计算里，"动画具体怎么播、生命周期怎么管"又分散在 `HandRow`/`DiscardPile`/`MeldGroup`/三个 FlipGhost 各自的组件里，彼此不协调；没有 diff、没有排队、没有取消——新 snapshot 到达就无条件立即整体替换，全靠各组件自己 `useState` 冻结一次性布尔值防止半途被打断，组件之间互不知情。用户希望引入统一的调度：按事件类型规划动作效果，关键事件（本人相关）始终完整播放，非关键事件（对手的装饰性动效）在积压时可以优雅跳过（这条原始诉求后来收窄：装饰性动效不做积压阈值，唯一的冲突调度只剩摸牌 lane——见关键决策 3/4）。

两部分都经过了对现有代码的实地调研（不是纸面设计），包括读了 `session.ts`、`useTablePresentation.ts`、`TableView.tsx`、`useIsIncrementalSnapshot.ts`、三个 `*FlipGhost.tsx`、`useFlightGhost.ts`、服务端 `room.service.ts`/`config.service.ts` 的实际 bot 节奏，以及 core 里 junk 和 bloodbattle 两个 ruleset 的 `PlayerView` 实际字段形状。

---

## 一、Tile 组件三层拆分：Slot / Motion / Face

**已完成**（`pnpm --filter @new-mj/web verify` 全绿，含 88 个 e2e）。落地细节、和计划的实际偏差见下方"需要改动的文件"。

### 目标架构

```
Tile.tsx（对外 API 不变：tileId/back/width/height/entering/dimmed/enlarged/
          reflow/clickable/selected/justDiscarded/onClick/className/testId
          全部照旧，调用方零改动）
  │
  ├─ isPlaceholder（tileId < 0）分支：直接渲染 TileSlot 的空盒子，不进入下面两层
  │
  └─ TileSlot（最外层，恒定存在，纯尺寸）
       └─ TileMotion（可选的动画壳，永远 h-full w-full 填满 TileSlot）
            └─ TileFace（视觉+点击，dimmed/enlarged 走纯 CSS）
```

- **TileSlot**：照抄现在 `Tile.tsx` 第220-227行的 width/height/aspectRatio 逻辑 + 占位格分支（现第186-203行），原样搬迁，不改行为。解决"多包一层导致百分比高度失效"的问题——真正的定高节点只有这一层，往下全部 `h-full w-full`。
- **TileMotion**：接 `entering`（`boolean | "opacityOnly"`，见下方"收紧非法状态"）/`reflow` 两个 prop（不加 `onEnterComplete`——调度器的完成回调由 ghost 独占，见第二部分"完成回调"），渲染 `motion.div`（或 reduced-motion 时的纯 `div`）。`initial`/`animate`/`transition`/`layout` 的取值逻辑抽成独立纯函数（如 `resolveTileMotion(entering)`），不依赖 React 渲染即可单测。**这一层携带 `data-testid`/`data-tile-id`/`data-entering`**（由 `Tile` 组合层算好 `isBack`/最终 tileId 后传入，不在 TileMotion 内部重复判断），因为它才是 motion 真正写 transform 的节点——满足 e2e 对"同一节点"的要求。
- **TileFace**：现在 Tile 去掉尺寸和 motion 之后剩下的部分——图片、`tileVariants`（clickable/selected/justDiscarded 的 CVA class）、`onClick`/`role`/`tabIndex`。`dimmed` 改成 `style.opacity`，`enlarged` 改成 CVA 里一个 `scale-[1.4]` 的纯 CSS class，配合 `transition-[opacity,transform]`。因为 TileFace 自己不再是 motion 节点，hover 放大也可以放回纯 CSS `hover:scale-*`。**遗留一个小风险**：`enlarged` 的持久 scale 和 hover 的 scale 是两条独立 CSS 规则，实现时验证一下 `DiscardPile.tsx` 传给 `enlarged` 的牌是否会同时是 `clickable`，如果会，需要用 CSS 变量合成 scale。

### 收紧一个非法状态：entering + noEnterMotion

`noEnterMotion` 只有在 `entering=true` 时才有意义（`entering=false, noEnterMotion=true` 无效，目前靠调用约定隐式维持）；`dimmed`/`enlarged`/`reflow` 之间没有相互制约的规则，不存在非法组合，本次不做进一步收敛（会牵动全部 5 处调用方，且失去"Tile 对外 API 零改动"这个优点）。

只合并 `entering`/`noEnterMotion` 这一对：`TileProps.entering?: boolean` + `TileProps.noEnterMotion?: boolean` → `TileProps.entering?: boolean | "opacityOnly"`。唯一需要改调用方式的是 `HandRow.tsx` 的 `DrawnSlotTile`，其余 4 处调用方不受影响。

### prefers-reduced-motion：复用现有实现，不要新建

`TableView.tsx` 里已经存在 `usePrefersReducedMotion()` 调用（约第190行）。实现时先定位这个 hook 的实际来源文件，`TileMotion` 直接复用它，**不要**新建 `usePrefersReducedMotion.ts`。这一步同时是"动画可关闭"的架构落地，也是补上 `docs/architecture/frontend-layout.md` 第39行（"`prefers-reduced-motion` 会禁用它们"）和 Tile 组件之间的差距——之前这句话只在 `TableView.tsx` 层面成立（控制 `canAnimateEntries`），Tile 自己并不知道。

### 需要改动的文件

- 新增：`TileSlot.tsx`、`TileMotion.tsx`、`resolveTileMotion.ts`（纯函数单独成文件——与 `TileMotion` 组件放同一个文件会触发 `react-refresh/only-export-components`）、`TileFace.tsx`（均在 `apps/web/src/features/mahjong/components/`）
- 修改：`Tile.tsx` —— 缩减为组合三层的公开入口，props/行为对外不变
- 修改：`HandRow.tsx` 的 `DrawnSlotTile` —— `entering`/`noEnterMotion` 合并传参
- 修改：`apps/web/test/table.e2e-spec.ts` —— 实际改动比原计划的"一处选择器"更广：Tile 内部多了一层嵌套后，凡是"定位靠 `data-testid`/`[data-tile-id]`（落在 TileMotion 上），断言 CSS 视觉效果（cursor/opacity，落在 TileFace 上）"的用例都要多钻一层子节点（`tile.firstElementChild`），第238行左右的结构选择器同理多一层；另外 `hover:scale-*` 从 motion 的 `whileHover` 换成 Tailwind 的 `scale`（CSS 独立 transform 属性，不是 `transform` 本身）后，用 `getComputedStyle(...).transform` 判断"是否已缩放"的断言需要改读 `.scale`；`DrawnSlotTile` 合并 `entering`/`noEnterMotion` 后，摸牌槽的 `data-entering` 从 `"true"` 变成字符串 `"opacityOnly"`，对应断言一并更新。全部在 `pnpm --filter @new-mj/web verify`（含 88 个 e2e）跑绿后确认。
- 不需要改动：`DiscardPile.tsx`、`ActionDock.tsx`、`MeldGroup.tsx`、`TileClaimSlot.tsx`、三个 `*FlipGhost.tsx`、`Tile.stories.tsx`、`tileMotionTiming.ts`

---

## 二、全桌动画调度架构

### 现状（已调研确认）

1. **`session.ts` 的 `applyGameSnapshot`**（第129-140行）：只做 `seq` 单调性校验，同步无条件整体替换 `view`，没有 diff、没有缓冲。**这个文件本次不改**。
2. **没有新旧快照 diff**：服务器在每份快照里自带"刚发生"指针字段（`extras.justDrawn`/`extras.lastDiscard`/`entry.claimedBy`/`handCount` 奇偶），前端靠一个全局粗粒度闸门 `canAnimateEntries = isIncrementalSnapshot && !prefersReducedMotion`（`TableView.tsx` 第189-198行）决定要不要播动画，不做逐条比较。
3. **没有排队/取消**：各消费组件各自 `useState(entering)` 冻结一次性布尔值防止被无关重渲染打断，组件之间不协调。摸牌槽（`HandRow.tsx` 的 `DrawnSlotTile`，`key={drawnSlotKey}`）是唯一会被 React key 变化强制卸载重建（连带打断 ghost）的地方；弃牌/副露的每个条目在数组里位置永久，不会互相打断。
4. **真牌和飞行 ghost 同一渲染周期一起挂载**，靠几何对齐（ghost 精确飞到 `toRef` 位置）而非时间/回调对齐，目前没有 `onAnimationComplete` 联动。
5. **`game:event` 只是诊断日志**（`TableView.tsx` 第74-77行），不驱动任何 UI，这是 `docs/architecture/frontend-layout.md` 明确写死的边界，新设计**不能**引入对它的消费。
6. **服务端时序**：`emitSnapshots` 每次 `runAction` 都真实推一条独立 socket 消息（`room.service.ts:393`），bot 节奏生产环境 600-1200ms、测试环境 0ms（`config.service.ts:81-86`）——300ms 量级的动效在生产节奏下几乎不会撞车，"积压"是测试环境会稳定触发但生产环境罕见的边界情况。
7. **两个 ruleset 的 `PlayerView` 形状不一致**：bloodbattle 没有 `justDrawn`；更关键的是 bloodbattle 的 `discards`/`melds` 存的是 **TileKind（花色点数，会重复）而不是全局唯一 TileId**——任何用牌值当 key 的设计在 bloodbattle 下都有真实碰撞风险。

### 关键决策

1. **数据渲染永远即时、正确，不被任何队列延迟**——这是不可退让的红线（`docs/architecture/frontend-layout.md`："最终状态始终以 snapshot 为准"）。被调度的只是"要不要播装饰性动效"这个决定，绝不是数据本身。`HandRow`/`DiscardPile`/`MeldGroup` 的实际数据（`handTiles`/`discards`/`melds`）永远不经过调度器。
2. **调度器的 key 统一用"局号+座位+数组下标"（如 `g3:discard:2:0`），不用牌值/TileId**——两个 ruleset 的 `discards`/`melds` 数组都只增不减，下标身份稳定，跨 ruleset 安全，也顺带保证对手动效的 key 不携带 TileId（不违反"TileId 与牌面同级敏感"的铁律）。局号前缀取 `RoomInfo.gameNumber`（store 里的 room 状态），让跨局重复出现的同下标 key 不依赖清理时序也不会碰撞；实现时确认换局时 room 更新与新局首份快照的先后（首份快照本就因 `gameSeq` 为 null 不注册，见 TableView 的 seq 守卫）。
3. **"关键事件全播"收窄为"除非同座位摸牌槽真实结构性冲突，否则总是全播，冲突时降级为直接显示终态"**（已与用户确认接受）。原因：`Tile.tsx` 的入场动画靠 Motion 的 `initial`，这个值只在组件**首次挂载**时生效一次，做不到"先不播、攒着以后补播"，除非把动画机制换成命令式 `useAnimate()` API，代价过大且会引入"数据已就绪但动效还没轮到播"这种和红线①冲突的状态。真正会被结构性抢占的只有摸牌槽（弃牌/副露天生不会互相打断）。
4. **不做装饰性积压阈值**——生产 bot 节奏（600-1200ms）下 300ms 量级动效几乎不重叠（见现状 6），阈值计数器只优化测试环境的边界场景，却引入整套"完成回调维护计数"的泄漏面（回调多触发/不触发都会永久污染计数）。装饰性事件的 resolution 只由 diff 是否产出该 key 决定；唯一需要互斥调度的是摸牌 lane（弃牌/副露条目天生不互相打断）。整个调度器不含任何计时（不读 `Date.now()`/不设 `setTimeout`）。
5. **不用新的 zustand store，用模块级单例**——调度器的"读"只发生在组件挂载时 `useState(() => resolve(key))` 一次，之后永远不再读；"写"只来自动效播完的命令式回调。完全用不到 zustand 的响应式订阅（订阅了也不该触发重渲染）。如果团队更看重"新状态都进 zustand"的一致性，可以等价地用 `create()` 包一层，行为不变。
6. **diff 放在 `TableView.tsx` 的 socket `onSnapshot` 回调里（`applyGameSnapshot` 之前），不放渲染层**——避开 `useIsIncrementalSnapshot.ts` 文档里提到的 StrictMode 双调用坑，JS 单线程保证背靠背到达的快照不会被 React 批处理漏看。
7. **飞行动画统一用 ghost 载体（portal 到 body），不引入 `layoutId` shared layout**——座位旋转是 `zoneStyle()` 写的普通 CSS `rotate`，motion 的 layout 动画不支持非它控制的祖先 transform（±90°/180° 下飞行方向与缩放错乱）；且牌河墓碑永不卸载，`layoutId` 交接必然复现 `Tile.tsx` 注释记录过的 crossfade 冲突。"真牌从对手手里飞出"之类的视觉走 ghost 增强（翻面/旋转角补间），不做盲牌替换。
8. **同一槽位"飞行"与"入场动画"互斥，由调度器统一裁决**——判为飞行的槽位挂 ghost、真牌只淡入（今天 `noEnterMotion` 的约定升级为调度器的正式语义）；判为入场的槽位只播 entering，两者不叠加。

### 具体设计

**新文件 `apps/web/src/features/mahjong/lib/diffPlayerView.ts`**（纯函数）：

```ts
export type SlotEvent = { key: string; category: "draw" | "decorative"; critical: boolean };

export function diffPlayerView(
  prev: PlayerViewBase | null,
  next: PlayerViewBase,
  mySeat: SeatId,
): SlotEvent[]
```

- 摸牌：己方 `next.justDrawn` 变化 → `draw:own:${seat}`；对手 `extras.seats[seat].justDrawn` 由 false/缺席变 true → `draw:opp:${seat}`；bloodbattle 恒为 `undefined`，天然不产出事件。
- 打牌：对每个座位的 `discards` 数组做**长度差集**（不能只看 `lastDiscard` 单点指针，否则两次观测之间发生多次打牌会漏事件），每个新增下标产出 `discard:${seat}:${index}`，`critical = seat === mySeat`。
- 吃碰杠：同理对 `melds` 数组做新增下标差集，`meld:${seat}:${meldIndex}`，`critical = seat === mySeat || meld.from === mySeat`（自己的牌被吃碰杠走，对自己也算关键事件）。补杠原地 mutate 已有副露而非 push 新条目，key 需要细化到 `meld:${seat}:${meldIndex}:${tiles.length}`，用当前长度兜住"同一 meldIndex 又长了一张"的情况。
- `prev === null`（首次连接/重连）直接返回空数组，不补播动画——这一段逻辑天然接管了 `useIsIncrementalSnapshot.ts` 目前承担的"是不是连续在线推进"判断，两处不需要重复维护。

**新文件 `apps/web/src/features/mahjong/lib/animationLedger.ts`**（模块单例）：

```ts
type Resolution = "flight" | "appear" | "skip";
const resolutions = new Map<string, Resolution>();
const drawLaneBusy = new Map<SeatId, string>();

/** 唯一写入口，由 TableView 的 onSnapshot 在 applyGameSnapshot 之前同步调用一次（外面有 seq 守卫）。 */
export function registerSnapshotDiff(prev, next, mySeat): void { /* 见下方逻辑 */ }

/** 纯读取，幂等——可能被 StrictMode 的 useState 惰性初始化调用两次，不能有副作用。 */
export function resolveSlot(key: string): Resolution {
  return resolutions.get(key) ?? "skip";
}

/**
 * 必须幂等：首次调用删除该 key 并清对应 lane，重复调用是 no-op——同一 key
 * 会被 ghost 的 onAnimationComplete 和消费组件的 unmount cleanup 各调一次，
 * 不能假设回调恰好触发一次。命令式，不触发重渲染。
 */
export function completeSlot(key: string, seat?: SeatId): void { /* ... */ }

/** 换局/重连时清空，由 TableView 在 resetGameSeq/setRoom(null) 时机调用；TableView mount 时也调一次，清掉单例跨挂载（e2e/StrictMode 重挂载）的残留。 */
export function resetAnimationLedger(): void { /* ... */ }
```

`registerSnapshotDiff` 内部：摸牌事件若 `drawLaneBusy.has(seat)` 则本次判 skip（不管 critical——这是唯一的"结构性冲突降级"，决策 3），**并同时结算旧 lane**——旧摸牌槽正被 key 变化卸载，不结算会永久占用，导致该座位后续摸牌动画全部 skip；装饰性事件不设阈值，diff 产出即注册。每个槽位按"是否有配套飞行"定为 `"flight"`（挂 ghost，真牌只淡入）或 `"appear"`（只播 entering），对应关键决策 8 的互斥语义。**lane 判断必须在 `registerSnapshotDiff` 里一次性定案，`resolveSlot` 只做只读查表**——如果把判断逻辑挪进 `resolveSlot`（会被 StrictMode 惰性初始化调用两次），会产生错误的双重占用。

**`TableView.tsx` 改动**：

```ts
const onSnapshot = (event: GameSnapshot) => {
  const { gameSeq, view } = useSessionStore.getState();
  // seq 守卫：与 applyGameSnapshot 的 `seq >= gameSeq`（session.ts:131）不同，
  // 这里要求严格大于——stale 快照不 diff（否则 prev 比 next 新，会产出幽灵事件）；
  // 同一 seq 覆盖不重播动画、不重复注册（否则 lane 被双重占用）。
  // gameSeq 为 null（首份快照/重连）时不注册，与 diffPlayerView 的 prev===null 分支同义。
  if (!prefersReducedMotion && gameSeq !== null && event.seq > gameSeq) {
    registerSnapshotDiff(view, event.view, event.view.seat);
  }
  useSessionStore.getState().applyGameSnapshot(event);
};
```

复用已有的 `prefersReducedMotion`（不新建检测）。`isIncrementalSnapshot` 保留但职责收窄为只服务 `RoundEndOverlay`（第306行附近），和这次改造无关，不动。换局重置时调用 `resetAnimationLedger()`。

`registerSnapshotDiff` 运行在 `applyGameSnapshot` 之前、旧 DOM 仍在，可顺带同步测量即将卸载的手牌元素 rect 存入调度器——补上超时代打（没有点击时捕获的 `fromRect`）时 `DiscardFlipGhost` 缺失的起点，纯几何值、不构成状态更新。

**`useTablePresentation.ts` 职责拆分（不是整体替换）**：
- 保留：`drawnSlotKey`、`justDiscarded`、`claimedByDirection` 等"数据身份"推导，和入场调度正交。
- 删除：`canAnimateEntries` 入参，以及派生的 `drawnSlotEntering`/`meldEntering`/`enterAnimation` 三个字段——职责整体搬到新增的 `useSlotEntering(key)` hook，由消费组件挂载时直接向 `animationLedger.ts` 要答案。

**消费组件改法**（新增 `useSlotEntering` hook，紧邻 `animationLedger.ts`；hook 内部把 `Resolution` 映射为消费组件需要的形状——`"flight"` → 挂 ghost + `entering: "opacityOnly"`，`"appear"` → `entering: true`，`"skip"` → 不播。hook 的 `useEffect` cleanup 在卸载时调 `completeSlot`，配合其幂等性覆盖"槽位中途卸载（换视图/摸牌槽被 key 顶替）导致 lane 永久占用"）：
- `HandRow.tsx` 的 `DrawnSlotTile`：`useState(entering)` → `useSlotEntering(drawKey)`。
- `DiscardPile.tsx` 的 `DiscardTileSlot`：`entry.enterAnimation` 依赖 → `useSlotEntering(discardKey)`（`useTablePresentation.ts` 顺带把 `seat`/`index` 传下来）。
- `MeldGroup.tsx` 的 `MeldClaimTile`：同理换成 `useSlotEntering(meldKey)`。
- 三个 `*FlipGhost.tsx` 本体不用改——只关心"要不要挂载"（由上面三个 wrapper 决定）和自己的飞行动画，对调度器无感知。

**完成回调**：三个 `*FlipGhost.tsx` 各自新增可选 `onAnimationComplete?: () => void` prop（一行改动/文件），`"flight"` 槽位由 ghost 独占完成回调。`"appear"` 槽位不需要任何完成回调（阈值已砍，没有计数要维护），因此 **`Tile`/`TileMotion` 不新增 `onEnterComplete` API**——这也避开了一个真实的坑：motion 的 `onAnimationComplete` 在每次 `animate` 收敛时都会触发，`Tile.tsx` 的 `animate` 含 `dimmed` 的 opacity，入场后 `dimmed` 翻转（弃牌墓碑的常态）会让同一节点再次 fire。

### 分阶段落地

- **阶段 0（纯基础设施，零可见行为变化）**：`diffPlayerView.ts` + `animationLedger.ts` 及各自单测（覆盖 junk 摸/打/吃碰杠、bloodbattle 无 justDrawn 时空产出、bloodbattle 同点数不同座位 key 不冲突、摸牌槽忙时第二次注册为 skip 且旧 lane 被结算、`completeSlot` 重复调用幂等、跨局同下标 key 因 gameNumber 前缀不碰撞；seq 守卫的同 seq/乱序场景在阶段 1 接入 TableView 时补）。验收：新单测通过，现有 e2e 原样绿。
- **阶段 1（摸牌槽，收益最高，唯一有真实 bug 修复价值）**：`TableView.tsx` 接 `registerSnapshotDiff`（含 seq 守卫与 mount 时 `resetAnimationLedger()`）；`HandRow.tsx` 迁移；`useTablePresentation.ts` 去掉 `drawnSlotEntering`；补 seq 守卫的同 seq/乱序单测。验收：现有摸牌相关 e2e 断言不变、原样绿（86 个 e2e 全绿，含 draw/discard/meld 的 entering 与 reduced-motion 断言）。
  - **"同座位连续两次摸牌不会强制中断/报错"改为单测覆盖，不新增 e2e**：实施时调研发现，当前 `apps/web/test/table.e2e-spec.ts` 的四个座位都是真实 Playwright 页面（非 AI bot），且全局共用同一个 server 进程 + 固定 `TEST_GAME_SEED=121`；这个精确形状（同一座位背靠背两次 `draw`，中间只夹一个 `GangMade`）只有暗杠/补杠会产生，而 seed=121 在朴素测试策略下全程不会出现暗杠机会。要稳定触发需要给这一个测试单独换 server 进程 + 新种子（验证过 seed=114/dealer=0 可行）或写一整局策略化脚本，投入明显超过这一验收项本身的价值。改为 `animationLedger.test.ts` 的"downgrades a second same-seat draw to skip while a first is still unresolved, and settles the old lane"直接覆盖调度逻辑本身（构造合成同座位连续两次摸牌 diff，断言不抛错、正确降级为 skip 并结算旧 lane）。
- **阶段 2（弃牌墙）**：`DiscardPile.tsx` 迁移，去掉 `enterAnimation`。顺带落地"注册期测量手牌 rect"，让超时代打的弃牌也有飞行起点。
- **阶段 3（副露）**：`MeldGroup.tsx` 迁移，去掉 `meldEntering`。
- **阶段 4（收尾）**：`useTablePresentation.ts` 删掉 `canAnimateEntries` 参数；`TableView.tsx` 精简 `onSnapshot`；`useTablePresentation.test.ts` 同步更新。
- **阶段 5（可选增强，不阻塞前四阶段验收）**：对手打牌飞行 ghost——从该座位手牌区 rect 起飞、背面翻转为正面、旋转角从源座位朝向补间到 0，key 沿用座位+下标；仍是 portal 到 body 的独立 ghost，不做盲牌替换（见关键决策 7）。

每阶段独立可合并、独立验收。

### 与 Tile 三层拆分计划的接口关系

成立：调度器只改变"谁在什么时候把 `entering` 传给谁"，`Tile`/`TileMotion` 不需要知道调度器存在，输入契约不变，且不新增任何 Tile 侧 API（完成回调由 ghost 独占）。两个计划互不阻塞，可任意顺序推进。

### 硬约束检查

| 约束 | 结果 |
|---|---|
| `session.ts` 不变、即时无条件覆盖 | ✅ `registerSnapshotDiff` 在 `applyGameSnapshot` 之前读旧值、之前调用 |
| 不消费 `game:event` | ✅ diff 输入是两份 `game:snapshot` 的 `view`，`onEvent` 继续只进诊断 `log` |
| 数据永远即时正确 | ✅ 调度器只决定要不要播装饰性动效，不经过任何实际渲染数据 |
| 不引入客户端时间/deadline 判断 | ✅ 调度只依赖 diff 结果与摸牌 lane 忙标记，无任何计时 |
| 不泄漏对手 TileId | ✅ 调度器 key 统一用座位+数组下标，不用牌值 |

### 测试影响

- Tile 三层拆分那两条 reflow 相关 e2e 完全不受这部分影响（不同代码路径）。
- 现有 draw/discard/meld 的 entering/reduced-motion 相关 e2e 断言内容不变，但触发机制变了（从渲染期读全局布尔变成 socket 回调里同步注册）。阈值已砍，装饰性 entering 不会被跳过，对手弃牌/副露断言在 0ms 节奏下依然稳定；唯一受 0ms 节奏影响的是摸牌 lane（见阶段 1 验收项）。
- 新增：摸牌槽结构性冲突的 e2e（阶段1）；seq 守卫、lane 结算、`completeSlot` 幂等这些场景全部用 `animationLedger.ts`/`diffPlayerView.ts` 的单测覆盖，不硬凑 e2e 时序。
- `useTablePresentation.test.ts` 随每个阶段同步删除对应字段断言，不要留到最后一次性改。

---

## 整体验证

1. `pnpm --filter @new-mj/web verify` 全绿（含类型检查/lint/单测），每个阶段都跑一次。
2. `apps/web/test/table.e2e-spec.ts` 全量跑：Tile 拆分部分重点盯 reflow 两条；动画调度部分重点盯 draw/discard/meld 的 entering 与 reduced-motion 断言、新增的摸牌槽冲突场景。
3. 手动 `pnpm dev` 在浏览器里过一遍：摸牌入场、出牌墓碑变暗、最新弃牌放大、吃碰杠候选高亮、手牌 discard 收拢滑动、连续快速摸牌/出牌时的表现——确认视觉效果和重构前一致，摸牌 lane 冲突时降级优雅不报错。
4. 浏览器 devtools 切换 `prefers-reduced-motion: reduce`，确认所有入场/滑动动效消失但数据/dimmed/enlarged/选中态依然正确。
5. bloodbattle 场景单独跑一遍，确认没有 `justDrawn` 时摸牌动效相关代码路径不报错、不产出错误事件。
