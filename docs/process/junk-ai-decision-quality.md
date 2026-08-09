# Junk AI 决策质量优化

> 当前专题只记录仍有效的决策、证据、边界和下一步。实验过程与旧 benchmark 保留在
> git history；稳定的 core 分层结论归 `docs/architecture/shanten.md`。本专题不包含
> `docs/process/垃圾胡性能优化讨论.md` 的进取/保守策略讨论。

## 范围与排序

按“验证优先 → 算法逻辑 → 高风险/收益不确定”推进。任何改变 AI 决策质量的改动，
必须有场景 fixture；性能改动必须同时有逐叶正确性和端到端 benchmark。未达到完整
探针基线前，不接入默认评分。

## 当前状态

Junk AI 基础设施、概率评分、迟疑阈值和结构缓存均已完成。轻量自摸 2-ply 探针已经
完成目标/反例 fixture，但当前约 13.3–13.6ms/probe，尚未达到默认评分门槛。

当前 Phase 2 已从 AI 层微优化转入 core 批量算法提案阶段：

1. 已完成无语义变化的 prober 模块拆分；
2. 已拒绝继续机械拆分单花色 solver/table-builder；
3. core batch API 提案已写出，待架构边界确认；
4. 确认前不实现、不导出到默认 AI 路径。

## 已接受结论

| 主题                      | 决策与证据                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tenpaiProbabilityWeight` | 接受超几何自摸概率模型。默认值 25 位于消融实验的稳定区间；概率项使 AI 更早处理孤立字牌、保留数牌。                                                                       |
| 自摸渠道池子              | 接受只用牌墙作为抽样总体，并按未见池墙份额修正 success count；修正后概率方向正确，决策分歧约 0.2%。                                                                      |
| `isolationPotential`      | 保留。向听无差异的纯多余孤立牌仍需要该信号；删除会丢失孤立字牌与孤立数牌的 tie-break。                                                                                   |
| `chiHurdle`/`pengHurdle`  | 接受默认 chi=8、peng=4。场景 fixture 证明低边际吃/碰回退 pass；20 seed decision diff 约 1.1%，方向符合预期。                                                             |
| 副露 `ukeire`             | 已修复：`existingMelds` 显式传入 shanten/ukeire；core 回归测试锁定开口手 false positive。                                                                                |
| 有界结构缓存              | 接受每个 arena `SeatPolicy` 独占、每局清空、上限 32 的 LRU。50 seed 命中率约 16.7%/18.7%/19.4%，属于低风险局部收益，不是主路径突破。                                     |
| core prober 拆分          | 接受将 `createShantenProber` 与 `createTwoChangeShantenProber` 移至 `shanten-prober.ts`；`shanten-suit-table.ts` 从 771 行降至 580 行，checksum 不变，benchmark 无回归。 |

## 已拒绝或暂缓

| 方案                              | 决策与原因                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| 花色集中/间距权重                 | 拒绝。单步 ukeire 的实测方向与假设相反；需要多步模型才能合理表达。                               |
| 同一决策增加 AI 外壳 cache        | 拒绝。同一 `scoreLegalActions` 内重复结构 key 仅约 0.26%，现有命中主要来自跨决策复现。           |
| 2-ply 直接接入默认评分            | 暂缓。core batch 局部约 1.7x，但接入完整 probe 曾由约 10.0ms 变为 10.9ms；没有端到端净收益证据。 |
| “弃牌后摸回同牌”剪枝              | 拒绝。反例证明摸回同牌可以降低向听，不能凭直觉剪枝。                                             |
| 继续拆单花色 solver/table-builder | 拒绝。需要额外共享索引/表类型模块，目前只有文件长度收益，没有明确性能或边界收益。                |

## Phase 2：core 批量算法计划

### 阶段 1：固定基线

固定 2-ply fixture、checksum、完整探针耗时和决策输出。局部 core benchmark 不能替代
完整 AI benchmark；当前完整探针基线约 13.3–13.6ms/probe。

### 阶段 2：core batch API 提案

目标是共享“弃牌候选 × 34 种摸牌”的 remove/add DP 状态，避免每个叶子独立重建
结构分析。第一版只处理标准 34 种牌；非标准 TileSet 继续走现有通用路径。

建议的最小输入：

```ts
type TwoPlyStructureBatchInput = Readonly<{
  counts: readonly number[];
  discardKindIndexes: readonly number[];
  sevenPairs: boolean;
  existingMelds: number;
}>;
```

建议的最小输出：

```ts
type TwoPlyStructureBatchResult = Readonly<{
  discardKindIndex: number;
  afterDiscardShanten: number;
  draws: readonly Readonly<{
    addKindIndex: number;
    shanten: number;
    improvingKindIndexes: readonly number[];
  }>[];
}>;
```

输入使用 count/index，避免每个叶子重建 TileId。返回值必须是独立只读数据，不能暴露
模块级 scratch。保留“弃牌后摸回同牌”候选。

core 不负责：

- TileId 选择、可见牌、活牌数量和墙中概率；
- `fanPotential`、安全度、门清损失、claim hurdle 和 `JunkWeights`；
- 对手行动、吃碰杠、终局番数、rollout 和动态攻守策略；
- 跨玩家、跨牌局或跨调用的隐式缓存。

### 阶段 3：正确性与性能 A/B

逐个比较 `(discardKindIndex, addKindIndex)` 与独立叶子 `evaluateUkeire` 的结果，覆盖：

- 固定 fixture 与随机标准手牌；
- 已有副露；
- 七对子开关；
- 四张已满、立即和牌、无效候选。

core 改动必须通过 `verify:full`，含至少 1000 局 fuzz。先比较新 API 自身与逐叶分析，
再接入诊断 `probeSelfDrawTwoPly`。完整 probe 不得慢于当前基线，checksum 和叶子
结果必须一致；局部 batch 变快但完整 probe 变慢时，拒绝接入。

### 阶段 4：诊断接入与默认准入

新 API 先只接入 `probeSelfDrawTwoPly`，进行多 seed 测量。只有端到端有净收益、没有
决策语义漂移，并通过 fixture/decision diff 后，才讨论默认评分接入。

### 阶段 5：必要时升级

若 batch API 仍不足，再依次评估整批叶子结构分析、增量活牌概率、只计算影响排序的
候选和专用标准形 DP 查询。x10 是理论优化空间，不是承诺结果。

> 当前接口形状和性能边界属于架构提案，需提回 Claude Project 确认；确认前不实现。

## 其他待选方向

- 防守/放铳风险模型：从固定现物 bonus 发展为对手危险度、筋/壁和攻守切换模型；改动面大，第三档。
- 吃碰 EV 模型：用番型分支的期望倍数替代启发式 `fanPotential`；与 2-ply 同级，需重新评估成本和规则边界。
- Monte Carlo rollout：只有在轻量 2-ply 证实有决策收益且仍不足时再考虑。

## 收尾条件

专题完成需要：默认策略有可解释的决策证据、性能改动有逐叶等价和端到端 benchmark、
core fuzz/verify 全绿、稳定结论分流到 architecture/contracts，并清除本专题在
`plan.md` 中的过程状态。
