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

当前 Phase 2 进入高潜候选评估阶段，不再把 core 批量 API 当成唯一前置路线：

1. 已完成无语义变化的 prober 模块拆分；
2. 已拒绝继续机械拆分单花色 solver/table-builder；
3. core batch API 提案已写出，待架构边界确认；
4. 不改公共接口的高潜候选可先独立评估；
5. 任何候选均须先完成性能/质量测试，再决定接受、拒绝或暂缓。

Top-N 2-ply 已加入仅诊断的候选预算 benchmark，未接入默认策略。32 个固定种子手牌、
3 轮共 96 个 case 的统一对照如下：

| 方案        | 相对全量 2-ply 的最佳弃牌一致率 | 平均 2-ply 分差 | ms/case |
| ----------- | ------------------------------: | --------------: | ------: |
| 1-ply       |                         71.875% |          0.4541 |       — |
| 2-ply Top-1 |                         71.875% |          0.4541 |    8.67 |
| 2-ply Top-2 |                         87.500% |          0.1038 |   16.91 |
| 2-ply Top-3 |                         93.750% |          0.0697 |   24.82 |
| 全量 2-ply  |                            100% |               0 |   95.25 |

Top-1 与 1-ply 一致是预期的，因为它们选择的是同一个 1-ply 第一候选。性能收益明确，
但决策漂移也明确，当前结论为**拒绝直接接入默认评分**，转入分级 2-ply 评估。此前
未将本次弃牌加入已知牌池的旧 benchmark 已失效，以上为修正后的数据。

分级 2-ply 的首个判据“先算 Top-2，按两者 2-ply 分差决定是否扩展全量”也已完成
32 手牌/96 case 测试：阈值 0–2 时回退率约 68.8%–71.9%，一致率 96.875%；阈值 5
才达到 100% 一致，但回退率 90.625%，估算耗时超过全量。该判据**拒绝**，不能作为
默认分级信号。

随后测试了基于 core 副产品的结构筛选：对每个弃牌批量计算弃牌后向听和 improving
ukeire，先按向听、再按扣除已知牌后的加权 ukeire 排序。1000 个确定性随机手牌的
结构 Top-4 A/B 为 93.1% 最佳弃牌一致率、平均 2-ply 分差 0.07894、34.13ms/case；
全量 2-ply 为 97.15ms/case，约 2.85x 加速。性能收益成立，但 6.9% 决策漂移仍过大，
当前结论为**暂不接入默认评分，保留为候选筛选实验**。此前 96 case 的 Top-4 全一致
不作为最终依据。

为避免后续每个候选都重复计算全量基准，已保留多线程生成器
`packages/ai/src/junk/two-ply-baseline-cli.ts`，并生成
[`packages/ai/benchmark-data/junk-two-ply-baseline.jsonl`](../../packages/ai/benchmark-data/junk-two-ply-baseline.jsonl)
和独立的 [`manifest`](../../packages/ai/benchmark-data/junk-two-ply-baseline.manifest.json)。
JSONL 每行保存一个实际 case，manifest 保存 seed、权重、Git revision、worker 数等元数据；
数据保存实际手牌而不只保存 seed，并记录每个弃牌的 1-ply/2-ply 汇总、继续概率、自摸和牌
概率、叶子数量和最佳弃牌；数值统一保留 9 位小数。不保存完整摸牌叶子，以控制文件大小。后续质量 A/B 应复用这批
全量结果；真实性能 benchmark 仍需偶尔重新跑全量。

基准复用命令为 `pnpm --filter @new-mj/ai compare:two-ply-baseline benchmark-data/junk-two-ply-baseline.jsonl [limit]`。
它流式读取 JSONL，只执行候选方案的计算；最新 1000 case 复用结果的最低向听黑名单仍为
100% 一致、平均保留 7.233 个候选、平均分差约 0，耗时 60.852ms/case。

结构化 fixture runner 为 `pnpm --filter @new-mj/ai bench:two-ply-structured`，当前覆盖
刻子/字牌、234 顺子块、七对子、开口吃、死牌、同向听不同 ukeire，以及清一色倾向、混一色
倾向、字牌刻子、七对子/单色取舍、幺九未来形状、开口清一色共 12 类手牌；12 类中结构
Top-4 和最低向听黑名单均与全量 2-ply 一致。新增 fixture 专门覆盖番型/未来形状偏好，
但该结果只证明已知边界没有立即反例，不能替代更大规模的对抗性搜索。

随后新增对抗性搜索工具 `pnpm --filter @new-mj/ai search:two-ply-adversarial [count] [output]`，
覆盖 0–2 个固定吃副露、随机手牌和最多 9 张可见弃牌；1000 个确定性样本中，最低向听
黑名单与全量 2-ply 的最佳弃牌一致率为 100%，未发现反例，耗时 88.703 秒。结果保存于
[`junk-two-ply-adversarial-cases.json`](../../packages/ai/benchmark-data/junk-two-ply-adversarial-cases.json)。
这只扩大了测试覆盖，不能证明该剪枝在所有番型/未来形状下安全，因此仍保持“候选接受、默认暂缓”。

为验证该结论是否依赖评分权重，结构化 runner 还加入了仅诊断的 fan-weight stress：将
`shantenWeight` 降为 10、`qingyise`/`hunyise` 提高为 160。在 `pure-suit-drift` fixture
中，全量 2-ply 选择 `1p`，最低向听黑名单只能保留并选择 `5z`，分差约 59.597；默认权重
仍一致。该反例说明最低向听黑名单不是与权重无关的安全剪枝，未来若调整 JunkWeights，
必须重新做质量 A/B，不能仅复用当前 100% 随机样本结论。

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

| 方案                          | 决策与原因                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 花色集中/间距权重             | 拒绝。单步 ukeire 的实测方向与假设相反；需要多步模型才能合理表达。                                                           |
| 同一决策增加 AI 外壳 cache    | 拒绝。同一 `scoreLegalActions` 内重复结构 key 仅约 0.26%，现有命中主要来自跨决策复现。                                       |
| 2-ply 直接接入默认评分        | 暂缓。core batch 局部约 1.7x，但接入完整 probe 曾由约 10.0ms 变为 10.9ms；没有端到端净收益证据。                             |
| Top-N 2-ply 直接替代全量候选  | 拒绝。修正概率模型后 32 手牌/96 case 中 N=1/2/3 一致率仅 71.9%/87.5%/93.8%；虽约快 11.0x/5.6x/3.8x，但决策漂移不可直接接受。 |
| Top-2 分差触发全量            | 拒绝。阈值 0–2 仍有 3.125% 漂移；阈值 5 才全一致但 90.625% case 回退，估算比全量更慢。                                       |
| 1-ply 分数作为 2-ply 安全上界 | 拒绝。修正后 Top-1 相对全量 2-ply 仅 71.9% 一致；现有 1-ply 只是排序启发式，不是可证明上界。                                 |
| 结构 Top-4 直接接入默认评分   | 暂缓。1000 手牌中 93.1% 一致、约 2.85x 加速；性能有效但决策漂移仍不可接受。                                                  |
| 最低向听黑名单跨权重复用       | 拒绝。fan-weight stress 在 `pure-suit-drift` 中出现 `1p` 对 `5z` 的决策漂移，证明该筛选依赖当前评分权重。             |

进一步测试了保守黑名单：只把“弃牌后向听高于所有候选最低值”的弃牌排除，最低向听层
的候选全部进入 2-ply。1000 个确定性随机手牌中平均保留 7.233 个候选，最佳弃牌一致率
100%、平均分差 0，耗时约 60.06–60.852ms/case；全量为 97.15ms/case，约 1.6x。结构化 fixture
和 1000 个对抗性样本也未发现反例。该结果比固定 Top-4 更稳，但测试仍不是穷举证明，
当前结论为**候选接受、默认暂缓**。
| “弃牌后摸回同牌”剪枝 | 拒绝。反例证明摸回同牌可以降低向听，不能凭直觉剪枝。 |
| 继续拆单花色 solver/table-builder | 拒绝。需要额外共享索引/表类型模块，目前只有文件长度收益，没有明确性能或边界收益。 |

## Phase 2：高潜候选评估计划

### 评估顺序与准入规则

候选分为两类并行推进：

- **无需新增公共接口**：Top-N 2-ply 候选缩减、分级 2-ply、单次决策缓存/内部增量实现、AI 层安全剪枝。
- **需要架构确认**：新增 core batch API，以及未来任何改变 core 公共职责或接口形状的方案。

每个候选统一经过：固定 benchmark → 场景/随机质量 A/B → 必要时逐叶正确性 → 完整
2-ply 端到端测量 → 接受、拒绝或暂缓。只在局部变快而完整 probe 不变快时拒绝性能接入；
只在决策差异可解释且质量指标不退化时接受质量改动。高潜不等于默认接纳，x10 仍只是理论上限。

首轮已完成不改公共接口的 Top-N 2-ply，下一步评估分级 2-ply；core batch API 保留架构确认后的
高潜路线，内部增量/缓存优化在不改变现有契约的前提下单独测量。

### 路线 A：不改公共接口

- Top-N 2-ply：先用现有启发式排序，仅对前 N 个弃牌做完整探针；比较最佳弃牌一致率、
  评分差异、反例命中和端到端耗时。
- 动态 N 2-ply：根据加权预评分曲线的分数差、断崖位置和候选数量决定 N；设置明确的
  `minN`/`maxN`，保证至少评估基本候选，同时限制平坦曲线带来的最坏耗时。实验比较
  不同边界和阈值，记录候选数、最佳弃牌一致率、实际分数遗憾
  (`fullBestValue - candidateBestValue`)、端到端耗时；不得仅以排名一致率判断质量。
- 分级 2-ply：普通局面走 1-ply，候选接近或关键局面才走 2-ply；比较平均耗时和关键决策
  的质量，不改变已有 2-ply 叶子语义。
- 内部增量/缓存：只修改现有 API 内部实现；必须保持逐叶结果等价，并验证缓存收益没有
  被分配、清理或命中判断开销抵消。
- AI 层安全剪枝：仅允许有明确上界的剪枝；无证明的近似剪枝必须单独标记为质量实验，
  不得直接进入默认路径。

### 路线 B：core batch API

### 阶段 1：固定基线

固定 2-ply fixture、checksum、完整探针耗时和决策输出。局部 core benchmark 不能替代
完整 AI benchmark。可复现实测命令为 `pnpm bench:junk-two-ply 100`，入口是
[`two-ply-benchmark.ts`](../../packages/ai/src/junk/two-ply-benchmark.ts)；当前一次
100 次热态测量为 `1360.544ms`、`13.60544ms/probe`，checksum 为
`-2411.856290493658`。机器和运行态会造成波动，后续以约 13.3–13.6ms/probe 作为
基线区间，不把单次数字当成绝对门槛。

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

若已评估路线仍不足，再依次评估整批叶子结构分析、增量活牌概率、只计算影响排序的
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
