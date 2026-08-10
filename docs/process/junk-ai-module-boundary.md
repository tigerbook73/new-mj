# 步骤 3：Junk AI 生产策略模块边界

## 目标与边界

把当前 `src/junk/strategy.ts` 中的结构分析、加权手牌质量、2-ply 续行和动作选择拆成单向依赖，不改变任何公式、默认权重、候选 cliff、动作引用或公共 API。纯诊断 evaluator 继续位于 `evaluation/`，生产模块不得反向依赖它。

## 当前调用图

```text
strategy.ts
├─ weights/defaults
├─ structural analysis
│  ├─ UkeireEvaluation cache
│  ├─ shanten / improving kinds
│  └─ visible-information live copies
├─ weighted hand quality
│  ├─ fanPotential / isolationPotential
│  └─ scoreHandShapeAfterDiscard / bestDiscardScore
├─ 2-ply continuation
│  ├─ probeSelfDrawTwoPly
│  ├─ upper/lower cliff
│  └─ continuation score
├─ action scoring
│  ├─ claim/gang simulation
│  ├─ one-ply / production / two-ply-all
│  └─ duplicate-kind memoization
└─ policy facade
   ├─ argmax / softmax
   └─ recommendJunkAction / chooseJunkAction
```

外部消费者分为三类：公共包只使用 `chooseJunkAction`、`recommendJunkAction` 和 `JunkStrengthConfig`；测试与离线工具还使用权重、cache、单步/2-ply probe 和评分诊断；`policy-loader` 会从 Git ref 复制 `strategy.ts` 及其闭包依赖后动态加载，任何物理拆分都必须保持新旧 ref 可加载。

## 目标依赖图

```text
weights
   ↓
analysis → hand-quality → two-ply → action-scoring → strategy facade
                                      ↑
                         policy-loader dependency snapshot
```

- `analysis`：只产生无权重结构事实与有界 cache，不知道动作选择、2-ply 或 evaluation。
- `hand-quality`：把结构事实映射为现有加权静态分数；不决定候选范围。
- `two-ply`：保留现有 upper/lower cliff、立即胡 fallback 和续行语义；不负责非弃牌动作。
- `action-scoring`：模拟动作并组合 one-ply/2-ply；保留原始合法动作引用。
- `strategy.ts`：兼容 facade，只保留最终选择并重导出现有内部诊断 API。

## 实施 slices

1. 先抽取 `weights` 与 `analysis`，同步更新 policy snapshot 的闭包依赖清单；证明 current module、历史 ref、显式 module path 三种加载方式不变。
2. 抽取 `hand-quality` 与 `two-ply`，用现有 bridge/dead-bridge/immediate-win 和 cliff fixture 锁定分数及候选集合。
3. 抽取 `action-scoring`，保持 `strategy.ts` facade 的导出形状和原始 action 引用；canonical 三路 baseline、`standard-only` 报告及 policy diff 必须等价。

## 验收

- 模块依赖严格单向，生产路径不 import `evaluation/`；
- `src/index.ts` 的 Junk 公共导出不扩张；`strategy.ts` 的现有测试/工具导出保持兼容；
- 六份既有 baseline matched，canonical 四路 evaluator 的 content hash、候选和选择不变；
- historical/current policy-loader 测试通过；
- `pnpm --filter @new-mj/ai verify` 与根 `pnpm verify` 全绿。

步骤完成后将最终边界与仍有效限制归并到 `plan.md`，删除本 brief；不保留逐 slice 过程记录。
