# Junk 普通型结构 facade slice

## 目标与验收

新增不接管生产默认的 `recommendStructuralJunkAction(view, legalActions)`，把已有普通标准型
claim 与 self-turn/discard 策略编排成完整 Junk 决策入口。使用真实 core 状态推进完整对局，并验证
每次非空 `legalActions` 都返回其中一个动作且可被 core 接受。

## 路由契约

- 空动作集返回 `undefined`。
- `hu`/`zimo` 在任何上下文优先，且必须返回传入的动作对象。
- 只有 `draw` 的流程上下文直接返回该动作，不进入牌形计算。
- 包含 `chi`、`peng`、`minGang`、`hu` 或 `pass` 的 claim 上下文交给
  `recommendStructuralClaim`。
- 其余 playing 上下文交给 `recommendStructuralTurn`，覆盖 discard、anGang、buGang 与 zimo。
- 子策略返回缺失或不属于当前 `legalActions` 时，按输入顺序回退到第一个合法动作；facade
  不构造动作、不实现规则，也不依赖 evaluation。

## 约束与最早验证

- 本 slice 不改 `recommendJunkAction`/`chooseJunkAction`，不改变生产行为。
- 只使用普通标准型结构；七对、番型、防守与其他玩法不接入。
- 单元测试固定空集、win、draw、claim、turn 与 fallback；跨模块测试从 core
  `createGame/getLegalActions/getPlayerView/applyAction` 驱动真实完整对局，最早发现路由遗漏或非法动作。
- 完整结构对局可能较慢，跨模块覆盖标记为 slow，由 AI `verify:full` 执行。
