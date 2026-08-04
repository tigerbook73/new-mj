# `apps/web/` 重构潜力评估

> 143 个源文件，~17 100 行代码（不含 `node_modules`/`dist`）。整体架构清晰：`src/app/` 组合根、`src/features/` 按域隔离、`src/shared/` 跨域复用——与 AGENTS.md 约定吻合。以下按**影响面 × 改动安全度**排序。

---

## 1. RoundEndOverlay 三套件：最大重复块 🔴

| 文件                                                                                                                                           | 行数 |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| [RoundEndOverlay.tsx](file:///home/tigerbook73/code/learn/new-mj/apps/web/src/features/mahjong/components/RoundEndOverlay.tsx)                 | 161  |
| [JunkRoundEndOverlay.tsx](file:///home/tigerbook73/code/learn/new-mj/apps/web/src/features/mahjong/components/JunkRoundEndOverlay.tsx)         | 190  |
| [HangzhouRoundEndOverlay.tsx](file:///home/tigerbook73/code/learn/new-mj/apps/web/src/features/mahjong/components/HangzhouRoundEndOverlay.tsx) | 211  |

**重复内容**：

- 动画常量完全相同（`BACKDROP_INITIAL/ANIMATE/EXIT`, `CARD_INITIAL/ANIMATE/EXIT`）——6 个常量 × 3 文件
- 外层 `motion.div` + 内层卡片壳的 JSX 结构 ~40 行逐字相同
- 底部按钮区（`onConfirm`/`onEnd`/`waitingOn`）完全相同 ~20 行
- Props 中 `entering/reducedMotion/gameNumber/totalGames/players/mySeat/myConfirmed/onConfirm/onEnd/winningHands` 形状一致
- 已有 [roundEndPresentation.ts](file:///home/tigerbook73/code/learn/new-mj/apps/web/src/features/mahjong/components/roundEndPresentation.ts) 提取了 3 个工具函数，但壳层仍是 copy-paste

**建议方案**：提取 `RoundEndOverlayShell`（动画壳 + 按钮区 + 等待文字），每个玩法 Overlay 只负责 **标题 + 番型详情** 区域，通过 `children` 或 render-prop 注入：

```tsx
// 伪代码
<RoundEndOverlayShell entering reducedMotion ...commonProps>
  {/* 只有这部分因玩法而异 */}
  <HangzhouFanDetail winners={...} />
</RoundEndOverlayShell>
```

> **与既有约定的关系**：plan.md Backlog 已有"结算展示优化（剩余）"条目，且 plan.md 提到 "当第三个同构玩法出现时评估下沉重复逻辑"——现在已经是三个了（junk / hangzhou / bloodbattle），触发条件已满足。

**估算**：~150 行净减。无功能变更，纯结构重构。

---

## 2. TableView.tsx 过于臃肿 🟠

[TableView.tsx](file:///home/tigerbook73/code/learn/new-mj/apps/web/src/features/mahjong/TableView.tsx)：**625 行单文件**，混合了：

| 关注点                              | 行数估算 | 说明                                                    |
| ----------------------------------- | -------- | ------------------------------------------------------- |
| Socket 事件注册                     | ~90      | `game:snapshot`, `game:event`, `room:*` 等 7 个 handler |
| 声音映射                            | ~30      | `soundForEvent`                                         |
| 服务端交互（send/leave/endSession） | ~50      | 6 个 async 函数                                         |
| AI Advice 轮询                      | ~15      | `game:advice` effect                                    |
| 玩法分支渲染（Overlay 三选一）      | ~70      | `rulesetId` switch                                      |
| Leave-confirm Dialog                | ~25      | 内联 Dialog                                             |
| Session-finished 面板               | ~50      | 内联面板                                                |
| Diagnostics / God Mode              | ~30      | dev-only 区域                                           |
| 核心展示编排                        | ~50      | `useTablePresentation` 调用 + seats/discards 计算       |

**问题**：这么多关注点混在一个函数组件里，每一次 socket 事件处理或 overlay 变更都需要读完整个文件。

**建议拆法**（不改行为，不改 props 契约）：

1. **`useTableSocket(socket, …)`** — 提取所有 `socket.on/off` 注册和 handler 函数（`onSnapshot`/`onEvent`/`onScoreUpdated` 等），返回 `{ log, sessionResult }`
2. **`useTableActions(socket)`** — 提取 `sendAction`/`confirmNextRound`/`leave`/`endSession`/`forceLeave`/`handOff`，返回动作函数集
3. **`SessionFinishedPanel`** — `sessionResult != null` 分支提为独立组件（含 Replay 链接）
4. **`LeaveConfirmDialog`** — 独立组件

拆后 TableView 降至 ~200 行，成为纯编排层。

---

## 3. LobbyView 的双状态问题 🟠

[LobbyView.tsx](file:///home/tigerbook73/code/learn/new-mj/apps/web/src/app/views/LobbyView.tsx)：443 行。

**核心问题**：同时维护 `preview`（本地 state）和 `room`（store）两套 RoomInfo，每个 socket 事件都要**同步更新两边**（`setPreview(...)` + `useSessionStore.setState(...)`），产生了 ~8 处并行更新逻辑。`shownRoom = room?.id === roomId ? room : preview` 的选择器在渲染时动态切换来源。

这不是 bug，但增加了认知负担和出错面——未来新增事件时容易只更新一边。

**建议**：

- `preview` 应该是 **唯一真相来源**（未入座的浏览者 never 写 `store.room`，这已经是当前行为）
- 或者统一到 store（增加 `previewRoom` 字段），让事件处理只写一个地方
- 但这触及 AGENTS.md 的 "薄页面积累专属逻辑后再晋升为 feature"——LobbyView 已经有足够逻辑晋升为 `features/lobby/`

> **当前 plan.md 未涉及此项**，但 Backlog 有"Room Page 优化"条目，届时一并处理成本最低。

---

## 4. GamePickerView 可晋升为 feature 🟡

[GamePickerView.tsx](file:///home/tigerbook73/code/learn/new-mj/apps/web/src/app/views/GamePickerView.tsx)：242 行，包含房间列表、搜索防抖、创建房间 Dialog、Tab 切换——已不算"薄页面"。

建议在下次增加功能时（plan.md Backlog 有 "Game Lobby 实时推送"）顺势晋升为 `features/lobby/`，把 LobbyView 也归入。

---

## 5. useTablePresentation：手牌构建逻辑可提函数 🟡

[useTablePresentation.ts](file:///home/tigerbook73/code/learn/new-mj/apps/web/src/features/mahjong/useTablePresentation.ts)：314 行。

`SEAT_DIRECTIONS.map(...)` 内部的 `handTiles` 构建逻辑（L161-200）有三层条件分支（bottom / godHand / opponent），每层又嵌套 caishen 过滤——合计 ~40 行连续条件代码。

**建议**：提取纯函数 `buildHandTiles(direction, view, godHand, extras, highlightCaishen)` 到同文件或 `lib/` 内，配单元测试。当前只通过 `useTablePresentation.test.ts`（378 行）间接覆盖，直接测纯函数更精准。

---

## 6. 动画常量重复 🟡

| 常量组                          | 重复处            |
| ------------------------------- | ----------------- |
| `BACKDROP_INITIAL/ANIMATE/EXIT` | 3 个 Overlay 文件 |
| `CARD_INITIAL/ANIMATE/EXIT`     | 3 个 Overlay 文件 |

6 个常量 × 3 文件 = 18 个定义，实际只有 6 个唯一值。可以提到 `roundEndPresentation.ts` 或独立的 `overlayMotion.ts`。

---

## 7. 分层统计与健康度

### 文件大小分布

| 范围       | 文件数 | 占比                                                      |
| ---------- | ------ | --------------------------------------------------------- |
| ≤ 100 行   | ~80    | 56%                                                       |
| 101–200 行 | ~30    | 21%                                                       |
| 201–400 行 | ~20    | 14%                                                       |
| 401–700 行 | ~5     | 3%                                                        |
| \> 700 行  | 2      | 1%（layoutSketch.ts 922, sidebar.tsx 686 是 shadcn 生成） |

> 绝大多数文件在合理范围内。> 400 行的 5 个文件是主要关注点。

### 架构合规

- ✅ `web` 只依赖 `@new-mj/protocol`，不 import `@new-mj/core`
- ✅ `shared/ui/` 是 shadcn 生成物，未手改
- ✅ Zustand 按域拆分（session store + tableLayout store）
- ✅ 测试文件位置正确（单元贴近 `src/`，E2E 在 `test/`）
- ✅ Socket handler 在 `useEffect` cleanup 中正确 `off`

### 未发现的问题

- 没有循环依赖
- 没有跨 feature 的非法 import（mahjong 不 import auth，layout-sketch 不 import mahjong）
- `shared/` 的每个成员确实被 ≥2 个 feature 使用
- 测试覆盖合理（核心 hooks/libs 有单元测试，关键用户流有 E2E）

---

## 8. 不建议动的部分

| 部分                             | 原因                                                    |
| -------------------------------- | ------------------------------------------------------- |
| `session.ts`（205 行）           | 字段多但职责单一（session slice），store 不分拆比分拆好 |
| `router.tsx`（182 行）           | loader 逻辑密集但与路由紧耦合，拆开反而更难追踪         |
| `layout-sketch/`（整个 feature） | DEV-only 工具，隔离良好，不值得花时间                   |
| `shared/ui/`（shadcn 生成）      | AGENTS.md 明确不手改                                    |
| `animationLedger.ts`（123 行）   | 职责清晰，大小合理                                      |

---

## 优先级汇总

| #   | 项目                        | 类型         | 净减行数       | 触发时机                                   |
| --- | --------------------------- | ------------ | -------------- | ------------------------------------------ |
| 1   | RoundEndOverlay 壳层提取    | 重复消除     | ~150           | **plan.md 已满足触发条件**（三个同构玩法） |
| 2   | TableView 拆分              | 单一职责     | ~0（重新分布） | 下次改动 TableView 时                      |
| 3   | LobbyView 双状态统一        | 简化心智模型 | ~30            | 随 Backlog "Room Page 优化"                |
| 4   | GamePickerView 晋升 feature | 分层         | ~0（移动）     | 随 Backlog "Game Lobby 实时推送"           |
| 5   | handTiles 构建纯函数提取    | 可测试性     | ~0             | 下次改动 useTablePresentation              |
| 6   | 动画常量去重                | 重复消除     | ~12            | 随 #1                                      |

> [!IMPORTANT]
> 所有建议均为**纯结构重构**，不涉及功能变更或架构铁律变更，不需要提交 Claude Project。第 1 项是唯一已满足自身触发条件的——plan.md Backlog 明确写了 "当第三个同构玩法出现时评估"。
