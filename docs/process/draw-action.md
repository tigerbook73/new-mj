# Brief：摸牌（draw）显式化

> 临时工作 brief，专题收尾后把耐久结论分流到 architecture/contracts/variants，删除本文件。

## 目标

把摸牌从 core 内部的自动转场副作用，变成显式的、`getLegalActions` 门控的 `{type:"draw"}` 动作，由 server 按可配置延时自动代提交，给 UI 让出摸牌前的可感知停顿窗口。**零协议 schema 改动**：延时是 server 编排层内部机制（仿"bot 出牌延时"），不是新的协议 deadline。

## 核心决策

1. **新相位** `"awaiting-draw"`（junk/bloodbattle 各自的 phase 联合类型都加）：discard 无人 claim、claim 窗口解算无人应下、自杠/被杠后补摸，一律先停在这里——`currentSeat` 已指向即将摸牌的座位，牌墙/手牌尚未变化。
2. **新动作** `{type:"draw"}`：该相位下 `getLegalActions` 对 `currentSeat` 精确返回 `[{type:"draw"}]`；`applyAction` 新分支执行原来内联的摸牌逻辑（牌墙位移、`TileDrawn`/`GangReplacementDrawn`、回到 `"playing"`、`TurnStarted`），门控与 `pass` 一样做二次校验。
3. **server 自动代提交**：仿"超时代 pass"识别手法（只看 `getLegalActions` 是否恰为 `[{type:"draw"}]`），新配置 `drawRevealDelayMs`（server-only）延时后走 `runAction(room, seat, {type:"draw"})`，对人类/bot/托管座位一视同仁；`nextBotAction` 需跳过这种座位，避免和摸牌定时器抢同一次转场。
4. **两个玩法同一批改**（已与用户确认）：避免 RuleSet 抽象在两个玩法间临时分叉；bloodbattle 目前"无人 claim"路径完全不发事件，这次要新增 `ClaimWindowResolved`（复用 junk 已有事件类型/payload 形状）。

## Slice 划分

- **Slice 1（使能，已完成）**：`packages/core` 两个玩法的相位/动作/`rebuildPlayerView`。验收 = `cross-ruleset-invariants.test.ts` 绿 + 两个玩法 fuzz ≥1000 局绿 + `pnpm --filter @new-mj/core verify` 全绿。
- **Slice 2（已完成）**：`apps/server` 的 `drawRevealDelayMs` 配置 + `scheduleDrawReveal` 定时器 + 清理 + `nextBotAction` 跳过逻辑；`room.service.spec.ts`/`config.service.spec.ts` 新增用例，两处既有 `playJunkGame` 回放测试（unit + e2e）改为跳过录制日志里的 `{type:"draw"}`（server 自己会代提交），`rooms.gateway.e2e-spec.ts` 的单动作时序断言改用较大 `drawRevealDelayMs` 隔离级联。`pnpm --filter @new-mj/server verify` 全绿。
- **Slice 3（进行中）**：`apps/web` 的 `useTablePresentation.ts` `hasDockActions` 排除 `draw`；单测 + 浏览器实跑。

## 关键实现要点（junk）

- `state-machine.ts`：`beginTurn` 拆分——`draw=false`（chi/peng）不变；`draw=true` 先探测牌墙空判断（维持流局逻辑），非空则转 `awaiting-draw` + `pendingDraw`，不再内联摸牌。新增 `applyDrawAction` 做原 `emitDraw` 尾段的事。
- `resolveUnclaimed` 两个 `result:"unclaimed"` 分支的 `ClaimWindowResolved` payload 补 `seat` 字段（唯一真正缺失重建信号的路径——`GangMade`/带 `action` 的 `ClaimWindowResolved` 都已经带 `seat`）。
- `view.ts`：`case "ClaimWindowResolved"` 在 `result==="unclaimed"` 时设 `phase="awaiting-draw"; currentSeat=payload.seat`；`case "GangMade"`（覆盖自杠与被 claim 的 minGang，chi/peng 不触发这个 case）统一设 `phase="awaiting-draw"; currentSeat=meldSeat`——不用动 `ChiMade`/`PengMade`，它们本就不摸牌。

## 关键实现要点（bloodbattle）

- `drawNext`/`drawReplacement` 同样拆分；`drawNext` 目前是唯一完全不发事件的"无人 claim"路径，需要新增 `ClaimWindowResolved{result:"unclaimed", seat}`。
- `view.ts`：`case "TileDiscarded"` 目前无条件把 `phase` 设为 `"awaiting-claims"`，需要新增 `case "ClaimWindowResolved"` 处理"无人 claim 直接进 awaiting-draw"的路径；`case "GangMade"` 同 junk 补设相位。

## apps/web 必需改动

`useTablePresentation.ts:69` 的 `hasDockActions`（`action.type !== "discard"`）要同时排除 `"draw"`，否则 `awaiting-draw` 这个短暂窗口会在动作栏闪出一个没有中文标签的 "draw" 按钮。动画代码（`DrawFlipGhost`/`justDrawn`/`useIsIncrementalSnapshot`）预期不用改，它们已经是纯 snapshot 反应式的。

## 完整设计与验证细节

见批准计划全文（本会话产出）：`~/.claude/plans/pick-ruleset-twinkling-hinton.md`（不在仓库里，供本次实现期间参考；专题收尾时把还有效的结论一并分流进 docs，然后可以不再依赖这个外部文件）。
