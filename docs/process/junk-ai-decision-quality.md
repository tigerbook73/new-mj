# Junk AI 决策质量优化

> 专题推演页（`docs/doc-map.md` 分流规则：专题推演放 `plan.md` 或临时一页
> `process/<topic>.md`）。Junk AI 决策质量相关的分析、实验记录与待办排期集中在
> 这里，`process/plan.md` 只留一句指针，避免主文件堆积。专题收尾时把仍有长期
> 价值的结论分流到 `architecture/`/`contracts/`，删除本文件。

## 排序框架

按风险/确定性分三档推进：① 验证优先（不改代码）→ ② 算法逻辑（不引入新参数，
或参数易配置）→ ③ 高风险/收益不确定。选定顺序前先过一遍这个框架，不要凭直觉
临时插队。

## 已完成

### Junk AI 自我优化基础设施（强度旋钮 / 自对弈驱动 / 权重参数化 / 调参脚本）

全部完成，`pnpm --filter @new-mj/ai verify:full` 全绿，详见 `packages/ai/AGENTS.md`
与 `packages/ai/src/junk/{strategy,arena,tune,tune-cli,tune-pool,tune-worker}.ts`。
性能优化（`worker_threads` 并行 + `standardShanten` memo 共享 + `kindIndexOf`
修正，单样例 80s→11s，约 7x）与调参自动收敛（sigma 阈值/多代无变异停止，
不再需要人工猜 `--max-generations`）均已上线。权重默认值改为数据文件
`packages/ai/src/junk/default-weights.json`，`tune-cli.ts --write` 是唯一写入口。

### Phase 1：`improvementWeight` → `tenpaiProbabilityWeight`

`strategy.ts` 用超几何进张概率（`tile-probability.ts`）替代原来"活牌数线性
加权、不区分开局/残局"的打分方式。为此新增跨版本/跨配置评估工具链
（`policy-loader.ts`/`decision-diff-cli.ts`/`compare-weights-cli.ts`/
`snapshot-junk-cli.ts`，规则见 `packages/ai/AGENTS.md`）。

发现一个系统性副作用并**接受**：AI 更不愿意吃/碰（概率项饱和而 menqing 固定
成本不变），权衡垃圾胡番型乘法连乘计分结构（丢门清直接砍半）后判定合理，补了
`strategy.test.ts` "still pengs when doing so reaches tenpai" 回归测试锁定下限。

**消融实验关键结论**（供后续调整 `tenpaiProbabilityWeight` 时参考，逐点扫描
∈{5,...,100}、每点 1000 场自对弈对拼纯 shanten 基线）：`menqing=8` 时 5–40
区间稳定赢 52–53%，过 40 回落、100 时跌破 50%；`menqing=0` 时权重大小完全不
影响胜率（概率项在向听打平时是单调标度，只有"要不要为了概率提升而开手"这类
跨项决策才受权重大小影响）。当前 `tenpaiProbabilityWeight=25` 落在安全区间内，
偏保守而非偏激进。

中局 `shanten<=1` 门槛已去掉（shanten/ukeire 性能提升后基准测试确认代价可接受，
1000 场 10.5s→16.4s，约 1.56x）。`decision-diff:junk` 对比主效果是"更早更坚决
打孤立字牌、保留数牌"（数牌 catchment 比字牌宽，真实麻将常识），已有 fixture
锁定（`strategy.test.ts` "prefers discarding a lone honor over breaking a live
number-tile cluster, even far from tenpai"）。

### ④+④-b：花色集中 / 间距 / 位次 验证（2026-08-08）

用诊断脚本直接对比裸 `ukeire`/`liveUkeireCount`（不经过 `isolationPotential`）：

- **位次差异（边张 1/9 vs 中张 3-7）已被精确捕捉**：1/9 位=3 种/16 活牌，2/8
  位=4 种/20 活牌，3~7 位打平=5 种/24 活牌，完全对称单调。不需要加位次分级
  权重——真实差异已存在于 `tenpaiProbabilityWeight` 链路，`isolationPotential`
  现在的二元固定加成可能与此信号重复，见下方"待选①"。
- **花色集中/间距假设不成立，效应方向相反**：同花色 gap=3（9 种/32 活牌）
  反而比 gap=5（10 种/36 活牌）和跨花色（11 种/40 活牌）活牌数更少——`ukeire`
  统计的是"能让向听下降的不同牌种"这种广度，两个孤立牌越接近邻域重叠越多、
  并集反而变小，"双向搭桥效率更高"这个麻将常识没有被这套单步广度指标建模成
  正向因素。**不要加间距/花色集中度权重**，真要建模需要多步前瞻（轻量 2-ply
  或 rollout），归入下方 Phase 2。

### ③ 自摸渠道池子修正（2026-08-08，commit `74ee505`）

`tenpaiProbability` 曾用"牌墙+对手手牌"合并池子当分母（`unseenPoolSize`），
却只用自己的摸牌轮次数当抽样次数（`remainingDraws`）——population 变大但
draws 没跟上，系统性低估自摸命中率。**已修**：population 改为牌墙本身，
successCount 按"牌墙/未见池"的期望占比拆分改进牌活牌数（`wallShare`，基于
可交换性假设，不引入新可调参数）。

数值验证：中局同一活牌数下概率 0.68→0.71（约 +0.025），残局阶段变化更小
（约 +0.005~+0.017）——幅度不大但方向一致、数学上更准确，已接受。`strategy.test.ts`
新增 fixture 直接断言修正后概率精确值、并证明严格高于旧 merged-pool 公式；
`decision-diff:junk` 侦察（20 种子、14485 决策点，佐证用非正式证据）：分歧率
0.2%（24 例），全部是活牌数接近的弃牌选择被小幅修正翻盘，无吃/碰/杠分歧，
符合预期。`verify:full` 全绿。

**碰（三个对手都可能来源）/ 吃（只有上家一个来源）的真正区分未做**，改归为
下方 Phase 2 一类问题：要做对得先知道 `ukeire()` 每个改进牌种具体是"补对子→
碰"还是"补搭子→吃"完成的，但 `ukeire()` 目前只返回黑盒结果，不暴露结构分解
信息，需要先从 core 挖出牌型分解数据，工程量接近 Phase 2 EV 模型；且"对手手里
的牌多久会被打出来"仍是未建模的行为概率。不再算"不引入新参数"这一档。

## 待选（未选定顺序）

- **① 评估 `isolationPotential` 是否该简化/去掉**：④-b 验证发现位次差异已被
  `tenpaiProbabilityWeight` 覆盖，但 honor-vs-number 这条区分轴是否也已被
  ukeire 隐式捕捉还未验证，需要专门 fixture 对比，不能凭推理下结论。
- **② 吃/碰迟疑阈值 δ hurdle**：`argmaxAction`（`strategy.ts:471-481`）对
  claim 和 pass 直接比大小，没有"claim 必须显著优于 pass 才通过"的门槛，是
  决策结构问题、不是调参能解决的。引入新参数 δ（可随 `gameProgress` 残局放宽
  动态调整），需要重新确认算第二档还是第三档。chi 与 peng 理论上应设不同
  门槛（chi 同时伤门清+碰碰胡+清一色三条线，peng 只伤门清）。
- **防守/放铳风险模型**：`safetyBonus`（`strategy.ts:265`）只对"现物"加固定
  分，没有对手危险度推理（副露/打牌节奏暗示听牌可能性、筋/壁牌相对安全推理），
  没有攻守切换逻辑，AI 永远单向最大化自己的进张——比番型权重更基础，是常见
  麻将 AI 强度短板。改动面大，第三档。
- **吃碰 EV 模型**：把 `fanPotential` 换成真正的期望倍数模型（枚举收尾番型
  分支×达成概率求和，复用 core `scoring.ts`），比 δ hurdle 准确但改动面大、
  单次决策计算量上升，与 Phase 2 同级。
- **Phase 2（远期 EV：轻量 2-ply → 必要时 Monte Carlo rollout）**：评估级，
  暂不实现。核心 API 已具备（`scoreJunkHand`/`decomposeStandardWinningHand`/
  `decomposeSevenPairsWinningHand` 已是 `@new-mj/core` 公开导出，不需要新增
  core API）。`2-ply` 是评估框架（当前弃牌→按活牌概率枚举下一摸→此时选最佳
  弃牌→评估叶子手牌），"进张后形状质量"是叶子评分手段，两者应组合而非二选一。
  建议 Phase 1（含③自摸修正）上线观察一段时间后再评估是否启动；启动第一步
  是基准测试轻量 2-ply 探针（不要直接写完整 rollout），并先写目标/反例
  fixture。未解决问题：模拟策略的性能代价、触发的 shanten 区间、是否/如何
  模拟对手行动与真实番数、"D 层后是否到达和牌"这类链式结果无闭式解。
- **自我优化基础设施推广到 hangzhou/bloodbattle**：可复用部分是 Layer
  B（打分求和）/C（强度旋钮）/D（自对弈引擎+调参算法）的实现模式，玩法专属
  Feature 抽取（对应各玩法番型/规则）仍需各自单独做，不会自动免掉。

## 历史细节（排查用，非当前待办）

`isolationPotential` 引入时的两次迭代（① 用"字牌不加分、数牌按 ±2 邻居给固定
分"修复"孤立字牌不优先打出"盲点；② 判断邻居改用弃牌前的 `referenceHand`，修复
"拆搭子制造新孤立牌"回归）完整背景见 git history 与 `strategy.ts:104-149` 顶部
注释，不再复述。
