# 麻将桌动画重构：Tile 三层拆分 + 全桌动画调度架构

> 临时专题文档（`doc-map.md` 分流规则）。完成后只在 `process/plan.md` 留一行完成摘要，耐久结论分流到 `architecture/frontend-layout.md`（动画边界一节）后本文件删除。

## Context

这次重构从"Tile 组件内部实现和动画耦合"这个具体问题出发，逐步扩大到"整桌动画策略"的重新设计。两部分目标不同但接口兼容，可以独立落地：

- **第一部分（Tile 三层拆分）**解决的是：Tile 组件同时承担定尺寸/渲染牌面/驱动 motion 动画三件事，导致 `dimmed`/`enlarged` 这些"状态"必须塞进 motion 的 `animate` 才能生效（CSS class 会被 motion 写的内联样式覆盖），基础展示和动画耦合在一起，动画没法独立开发/关闭。
- **第二部分（动画调度架构）**解决的是：现在"要不要播入场动画"分散在 `useTablePresentation.ts` 的一次性字段计算里，"动画具体怎么播、生命周期怎么管"又分散在 `HandRow`/`DiscardPile`/`MeldGroup`/三个 FlipGhost 各自的组件里，彼此不协调；没有 diff、没有排队、没有取消——新 snapshot 到达就无条件立即整体替换，全靠各组件自己 `useState` 冻结一次性布尔值防止半途被打断，组件之间互不知情。用户希望引入统一的调度：按事件类型规划动作效果，关键事件（本人相关）始终完整播放，非关键事件（对手的装饰性动效）在积压时可以优雅跳过。

两部分都经过了对现有代码的实地调研（不是纸面设计），包括读了 `session.ts`、`useTablePresentation.ts`、`TableView.tsx`、`useIsIncrementalSnapshot.ts`、三个 `*FlipGhost.tsx`、`useFlightGhost.ts`、服务端 `room.service.ts`/`config.service.ts` 的实际 bot 节奏，以及 core 里 junk 和 bloodbattle 两个 ruleset 的 `PlayerView` 实际字段形状。

---

## 一、Tile 组件三层拆分：Slot / Motion / Face

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
- **TileMotion**：接 `entering`（`boolean | "opacityOnly"`，见下方"收紧非法状态"）/`reflow`/`onEnterComplete`（见第二部分 2.6，供动画调度器回调）三个 prop，渲染 `motion.div`（或 reduced-motion 时的纯 `div`）。`initial`/`animate`/`transition`/`layout` 的取值逻辑抽成独立纯函数（如 `resolveTileMotion(entering)`），不依赖 React 渲染即可单测。**这一层携带 `data-testid`/`data-tile-id`/`data-entering`**（由 `Tile` 组合层算好 `isBack`/最终 tileId 后传入，不在 TileMotion 内部重复判断），因为它才是 motion 真正写 transform 的节点——满足 e2e 对"同一节点"的要求。
- **TileFace**：现在 Tile 去掉尺寸和 motion 之后剩下的部分——图片、`tileVariants`（clickable/selected/justDiscarded 的 CVA class）、`onClick`/`role`/`tabIndex`。`dimmed` 改成 `style.opacity`，`enlarged` 改成 CVA 里一个 `scale-[1.4]` 的纯 CSS class，配合 `transition-[opacity,transform]`。因为 TileFace 自己不再是 motion 节点，hover 放大也可以放回纯 CSS `hover:scale-*`。**遗留一个小风险**：`enlarged` 的持久 scale 和 hover 的 scale 是两条独立 CSS 规则，实现时验证一下 `DiscardPile.tsx` 传给 `enlarged` 的牌是否会同时是 `clickable`，如果会，需要用 CSS 变量合成 scale。

### 收紧一个非法状态：entering + noEnterMotion

`noEnterMotion` 只有在 `entering=true` 时才有意义（`entering=false, noEnterMotion=true` 无效，目前靠调用约定隐式维持）；`dimmed`/`enlarged`/`reflow` 之间没有相互制约的规则，不存在非法组合，本次不做进一步收敛（会牵动全部 5 处调用方，且失去"Tile 对外 API 零改动"这个优点）。

只合并 `entering`/`noEnterMotion` 这一对：`TileProps.entering?: boolean` + `TileProps.noEnterMotion?: boolean` → `TileProps.entering?: boolean | "opacityOnly"`。唯一需要改调用方式的是 `HandRow.tsx` 的 `DrawnSlotTile`，其余 4 处调用方不受影响。

### prefers-reduced-motion：复用现有实现，不要新建

`TableView.tsx` 里已经存在 `usePrefersReducedMotion()` 调用（约第190行）。实现时先定位这个 hook 的实际来源文件，`TileMotion` 直接复用它，**不要**新建 `usePrefersReducedMotion.ts`。这一步同时是"动画可关闭"的架构落地，也是补上 `docs/architecture/frontend-layout.md` 第39行（"`prefers-reduced-motion` 会禁用它们"）和 Tile 组件之间的差距——之前这句话只在 `TableView.tsx` 层面成立（控制 `canAnimateEntries`），Tile 自己并不知道。

### 需要改动的文件

- 新增：`TileSlot.tsx`、`TileMotion.tsx`（含 `resolveTileMotion` 纯函数）、`TileFace.tsx`（均在 `apps/web/src/features/mahjong/components/`）
- 修改：`Tile.tsx` —— 缩减为组合三层的公开入口，props/行为对外不变
- 修改：`HandRow.tsx` 的 `DrawnSlotTile` —— `entering`/`noEnterMotion` 合并传参
- 修改：`apps/web/test/table.e2e-spec.ts` 第238行左右的 `[data-testid="player-track-right"] > div > div:first-child` —— Tile 内部多了一层嵌套，选择器要多钻一层，**以实际渲染 DOM 为准核对**，不要照抄字符串（对手手牌是否带 `data-tile-id` 涉及隐私边界，可能影响能不能换成属性选择器）
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
2. **调度器的 key 统一用"座位+数组下标"，不用牌值/TileId**——两个 ruleset 的 `discards`/`melds` 数组都只增不减，下标身份稳定，跨 ruleset 安全，也顺带保证对手动效的 key 不携带 TileId（不违反"TileId 与牌面同级敏感"的铁律）。
3. **"关键事件全播"收窄为"除非同座位摸牌槽真实结构性冲突，否则总是全播，冲突时降级为直接显示终态"**（已与用户确认接受）。原因：`Tile.tsx` 的入场动画靠 Motion 的 `initial`，这个值只在组件**首次挂载**时生效一次，做不到"先不播、攒着以后补播"，除非把动画机制换成命令式 `useAnimate()` API，代价过大且会引入"数据已就绪但动效还没轮到播"这种和红线①冲突的状态。真正会被结构性抢占的只有摸牌槽（弃牌/副露天生不会互相打断）。
4. **积压判断用计数，不用耗时**——非关键动效的"是否超过阈值"是一个活跃计数器（`activeDecorativeCount < N`），不读 `Date.now()`/不设 `setTimeout`，避免违反"时间只在 server"这条铁律。
5. **不用新的 zustand store，用模块级单例**——调度器的"读"只发生在组件挂载时 `useState(() => resolve(key))` 一次，之后永远不再读；"写"只来自动效播完的命令式回调。完全用不到 zustand 的响应式订阅（订阅了也不该触发重渲染）。如果团队更看重"新状态都进 zustand"的一致性，可以等价地用 `create()` 包一层，行为不变。
6. **diff 放在 `TableView.tsx` 的 socket `onSnapshot` 回调里（`applyGameSnapshot` 之前），不放渲染层**——避开 `useIsIncrementalSnapshot.ts` 文档里提到的 StrictMode 双调用坑，JS 单线程保证背靠背到达的快照不会被 React 批处理漏看。

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

**新文件 `apps/web/src/features/mahjong/lib/animationQueue.ts`**（模块单例）：

```ts
type Resolution = "play" | "skip";
const MAX_CONCURRENT_DECORATIVE = 2;
const resolutions = new Map<string, Resolution>();
const drawLaneBusy = new Map<SeatId, string>();
let activeDecorativeCount = 0;

/** 唯一写入口，由 TableView 的 onSnapshot 在 applyGameSnapshot 之前同步调用一次。 */
export function registerSnapshotDiff(prev, next, mySeat): void { /* 见下方逻辑 */ }

/** 纯读取，幂等——可能被 StrictMode 的 useState 惰性初始化调用两次，不能有副作用。 */
export function resolveSlot(key: string): boolean {
  return resolutions.get(key) === "play";
}

/** 由 onEnterComplete/ghost onAnimationComplete 调用，命令式，不触发重渲染。 */
export function completeSlot(key: string, seat?: SeatId): void { /* ... */ }

/** 换局/重连时清空，由 TableView 在 resetGameSeq/setRoom(null) 时机调用。 */
export function resetAnimationQueue(): void { /* ... */ }
```

`registerSnapshotDiff` 内部：摸牌事件按 `drawLaneBusy.has(seat)` 判断能不能播（忙则 skip，不管 critical——这是唯一的"结构性冲突降级"）；装饰性事件按 `event.critical || activeDecorativeCount < MAX_CONCURRENT_DECORATIVE` 判断。**"判断忙不忙/超没超阈值"必须在 `registerSnapshotDiff` 里一次性定案，`resolveSlot` 只做只读查表**——如果把判断逻辑挪进 `resolveSlot`（会被 StrictMode 惰性初始化调用两次），会产生错误的双重占用。

**`TableView.tsx` 改动**：

```ts
const onSnapshot = (event: GameSnapshot) => {
  if (!prefersReducedMotion) {
    registerSnapshotDiff(useSessionStore.getState().view, event.view, event.view.seat);
  }
  useSessionStore.getState().applyGameSnapshot(event);
};
```

复用已有的 `prefersReducedMotion`（不新建检测）。`isIncrementalSnapshot` 保留但职责收窄为只服务 `RoundEndOverlay`（第306行附近），和这次改造无关，不动。换局重置时调用 `resetAnimationQueue()`。

**`useTablePresentation.ts` 职责拆分（不是整体替换）**：
- 保留：`drawnSlotKey`、`justDiscarded`、`claimedByDirection` 等"数据身份"推导，和入场调度正交。
- 删除：`canAnimateEntries` 入参，以及派生的 `drawnSlotEntering`/`meldEntering`/`enterAnimation` 三个字段——职责整体搬到新增的 `useSlotEntering(key)` hook，由消费组件挂载时直接向 `animationQueue.ts` 要答案。

**消费组件改法**（新增 `useSlotEntering` hook，紧邻 `animationQueue.ts`）：
- `HandRow.tsx` 的 `DrawnSlotTile`：`useState(entering)` → `useSlotEntering(drawKey)`。
- `DiscardPile.tsx` 的 `DiscardTileSlot`：`entry.enterAnimation` 依赖 → `useSlotEntering(discardKey)`（`useTablePresentation.ts` 顺带把 `seat`/`index` 传下来）。
- `MeldGroup.tsx` 的 `MeldClaimTile`：同理换成 `useSlotEntering(meldKey)`。
- 三个 `*FlipGhost.tsx` 本体不用改——只关心"要不要挂载"（由上面三个 wrapper 决定）和自己的飞行动画，对调度器无感知。

**`onAnimationComplete` 扩展**：三个 `*FlipGhost.tsx` 各自新增可选 `onAnimationComplete?: () => void` prop，一并调用（一行改动/文件）；`Tile.tsx`（或未来的 `TileMotion`）新增 `onEnterComplete?: () => void`，接到 `motion.div` 的 `onAnimationComplete`（仅 `entering` 时）。没有 ghost 的纯 entering 场景（多数弃牌/副露条目）也需要这个回调，否则 `activeDecorativeCount` 只增不减。

### 分阶段落地

- **阶段 0（纯基础设施，零可见行为变化）**：`diffPlayerView.ts` + `animationQueue.ts` 及各自单测（覆盖 junk 摸/打/吃碰杠、bloodbattle 无 justDrawn 时空产出、bloodbattle 同点数不同座位 key 不冲突、摸牌槽忙时第二次注册为 skip、非关键计数超阈值为 skip）。`Tile.tsx` 加 `onEnterComplete`，暂不接调用方。验收：新单测通过，现有 e2e 原样绿。
- **阶段 1（摸牌槽，收益最高，唯一有真实 bug 修复价值）**：`TableView.tsx` 接 `registerSnapshotDiff`；`HandRow.tsx` 迁移；`useTablePresentation.ts` 去掉 `drawnSlotEntering`。验收：现有摸牌相关 e2e 断言不变、原样绿；新增"同座位连续两次摸牌不会强制中断/报错"的 e2e。
- **阶段 2（弃牌墙）**：`DiscardPile.tsx` 迁移，去掉 `enterAnimation`；新增阈值场景的单测。
- **阶段 3（副露）**：`MeldGroup.tsx` 迁移，去掉 `meldEntering`。
- **阶段 4（收尾）**：`useTablePresentation.ts` 删掉 `canAnimateEntries` 参数；`TableView.tsx` 精简 `onSnapshot`；`useTablePresentation.test.ts` 同步更新。

每阶段独立可合并、独立验收。

### 与 Tile 三层拆分计划的接口关系

成立：调度器只改变"谁在什么时候把 `entering` 传给谁"，`Tile`/`TileMotion` 不需要知道调度器存在，输入契约不变。唯一新增职责是 `onEnterComplete` 回调，与调度器具体实现无关。两个计划互不阻塞，可任意顺序推进；若 Tile 拆分先落地，`onEnterComplete` 直接加在 `TileMotion` 上。

### 硬约束检查

| 约束 | 结果 |
|---|---|
| `session.ts` 不变、即时无条件覆盖 | ✅ `registerSnapshotDiff` 在 `applyGameSnapshot` 之前读旧值、之前调用 |
| 不消费 `game:event` | ✅ diff 输入是两份 `game:snapshot` 的 `view`，`onEvent` 继续只进诊断 `log` |
| 数据永远即时正确 | ✅ 调度器只决定要不要播装饰性动效，不经过任何实际渲染数据 |
| 不引入客户端时间/deadline 判断 | ✅ 积压判断是计数，不是 `Date.now()`/`setTimeout` |
| 不泄漏对手 TileId | ✅ 调度器 key 统一用座位+数组下标，不用牌值 |

### 测试影响

- Tile 三层拆分那两条 reflow 相关 e2e 完全不受这部分影响（不同代码路径）。
- 现有 draw/discard/meld 的 entering/reduced-motion 相关 e2e 断言预期不需要改内容，但触发机制变了（从渲染期读全局布尔变成 socket 回调里同步注册），需要重新跑一遍确认时序稳定。
- 新增：摸牌槽结构性冲突的 e2e（阶段1）；积压跳过、关键事件槽位冲突两类场景优先用 `animationQueue.ts`/`diffPlayerView.ts` 的单测覆盖，不硬凑 e2e 时序。
- `useTablePresentation.test.ts` 随每个阶段同步删除对应字段断言，不要留到最后一次性改。

---

## 整体验证

1. `pnpm --filter @new-mj/web verify` 全绿（含类型检查/lint/单测），每个阶段都跑一次。
2. `apps/web/test/table.e2e-spec.ts` 全量跑：Tile 拆分部分重点盯 reflow 两条；动画调度部分重点盯 draw/discard/meld 的 entering 与 reduced-motion 断言、新增的摸牌槽冲突场景。
3. 手动 `pnpm dev` 在浏览器里过一遍：摸牌入场、出牌墓碑变暗、最新弃牌放大、吃碰杠候选高亮、手牌 discard 收拢滑动、连续快速摸牌/出牌时的降级表现——确认视觉效果和重构前一致，积压场景下降级优雅不报错。
4. 浏览器 devtools 切换 `prefers-reduced-motion: reduce`，确认所有入场/滑动动效消失但数据/dimmed/enlarged/选中态依然正确。
5. bloodbattle 场景单独跑一遍，确认没有 `justDrawn` 时摸牌动效相关代码路径不报错、不产出错误事件。
