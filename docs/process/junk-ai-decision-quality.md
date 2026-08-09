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
  权重——真实差异已存在于 `tenpaiProbabilityWeight` 链路。（当时怀疑
  `isolationPotential` 因此冗余，验证后发现结论更细致，见下方"① `isolationPotential`
  冗余评估已完成"。）
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

### ① `isolationPotential` 冗余评估已完成（2026-08-08）：**结论是保留，不简化**

④-b 曾speculate它可能冗余，验证后发现结论要分两种情形，且早前的推测只看到了
其中一种：

- **孤立牌仍在向听计算里起作用时（还差的那个 block 候选）**：raw
  ukeire/liveUkeireCount 已经把"字牌 vs 数牌""边张 vs 中张"放在同一条连续谱系
  上精确区分——诊断脚本对比"留孤立 5m"(shanten=1, 7 种 ukeire, 24 活牌) vs
  "留孤立 1z"(shanten=1, 3 种 ukeire, 8 活牌)：3 倍差距，比④-b 测出的边张/
  中张差距（约 1.5 倍）还悬殊，因为字牌在这条谱系上等于"永远的最差位置"（0 个
  可搭桥邻居，边张好歹还有 2 个）。这部分 `tenpaiProbabilityWeight` 链路已经
  精确覆盖，`isolationPotential` 在这里是重复加成，但方向一致、不会翻转决策，
  无害。
- **孤立牌已经是纯多余（手牌已够 block 数，这张牌怎么弃都不影响 shanten）时**：
  诊断脚本显示两种候选（孤立 1z vs 孤立 5m）算出**完全相同**的 shanten/ukeire
  ——广度指标看不出任何差异，因为这张牌对当前向听真的毫无贡献。这正是
  `isolationPotential` 唯一能提供新信号的场景，也是它最初要解决的场景——已有
  fixture 锁定（`strategy.test.ts` "prefers discarding an isolated honor over
  an isolated number tile at equal shanten"，该用例注释明确写着"两种弃牌在
  shanten/fanPotential 上完全打平"，即不靠 `isolationPotential` 分不出胜负）。

**结论：保留 `isolationPotential`，不简化/不去掉**；也不需要额外改动（重复
加成的那部分是无害的，专门为它加"只在纯多余时才触发"的门槛属于过度设计，
没有实测证据支持这类改动能修正任何错误决策）。未额外提交代码改动，仅更正本
文档此前的推测。

### core bug：`ukeire()` 忽略已有副露，导致开口手牌的进张被高估（2026-08-08）

排查 δ hurdle 的 fixture 时，构造一个有 2 个已声明副露的手牌，发现 `ukeire()`
把摸一张实际不降向听的牌种（9m）也报成"进张"——直接验证：`shantenWithExposedMelds`
用 2 副露算出向听 0，摸 9m 后仍是 0（没变），但 `ukeire()` 却把 9m 也列进候选。

**根因**：`ukeire(tiles, options, tileSet)` 内部硬编码 `existingMelds=0` 传给
`computeShantenFromCounts`/`createShantenProber`，不管调用方实际有几个已声明
副露——跟 `shantenWithExposedMelds` 用的是两套不一致的基准。`strategy.ts:256`
调用 `ukeire(input.hand, {...})` 时同样没传副露数，且旧注释还写着"ukeire 内部
的向听差值不受副露数量的常数偏移影响，因此这里不需要把偏移传进去"——这个假设
是错的，也是 bug 存在的原因。

**影响范围**：所有"手牌已有副露"场景下的 `tenpaiProbability`/`liveUkeireCount`
计算都可能被这类 false positive 拉高——即所有涉及吃/碰/杠之后的打分。

**已修**（`packages/core/src/lib/shanten.ts`）：`ukeire`/`computeShanten`/
`isTingpai` 新增 `existingMelds` 参数（默认 0，不破坏现有调用方），正确转发给
底层已经支持这个参数的 `computeShantenFromCounts`/`createShantenProber`。
`strategy.ts` 调用点改为显式传 `input.melds.length`。`shanten.test.ts` 新增
回归用例锁定这个具体场景；`packages/core` `verify:full` 全绿（189 用例，含
fuzz）。

数值影响：重跑 δ hurdle 调研用的 margin 分布诊断（20 种子自对弈，仅对比
"有 bug"vs"无 bug"、两侧都不带 hurdle）——薄边际 claim（margin≤10）占比从
13.2%降到 8.0%，margin≤0.5 从 5.1%降到 1.3%，说明这个 bug 是"低价值吃碰"
现象的一部分真实成因，不只是理论顾虑。

### ① 吃/碰迟疑阈值 δ hurdle 已完成（2026-08-08，commit 待提交）

**先验证问题是否真实存在**：修 ukeire bug 前，自对弈实测发现约 13%的被接受
claim（chi/peng）只以 ≤10 的分差压线胜过 pass，5.1%在 ≤0.5（噪声级别）——
证实"阻挡低价值吃碰"不是纯理论担忧。修完 ukeire bug 后此现象显著缓解但没有
消失（分别降到 8.0%/1.3%），说明 δ hurdle 仍有独立价值，值得继续做。

**实现**：`JunkWeights` 新增 `chiHurdle`（默认 8）/`pengHurdle`（默认 4）——
chi 门槛更高，呼应"chi 伤门清+碰碰胡两条线（碰碰胡按规则明确排除吃，
`scoring.ts:41`）、peng 只伤门清一条线；清一色/混一色只看花色纯度，与吃碰
无关，2026-08-08 核实并更正过此前的误判"。`scoreAction`（`strategy.ts`）对 chi/peng/minGang 分支的
最终得分统一减去对应门槛，再进入 argmax/softmax 比较——不改 `argmaxAction`
本身，效果自然扩散到 softmax 强度采样。

**fixture 证据**（`strategy.test.ts`，按 `packages/ai/AGENTS.md` 公式类改动
要求）：① 一个手算构造的场景，chi 与 pass 的裸分数**精确相等**（验证到小数点
后 10 位），不带 hurdle 时 `argmaxAction` 纯靠数组顺序打平局（列在前面的 chi
胜出）——带 hurdle 后正确回退到 pass，直接证明"打平局不该开口"这个 δ hurdle
的核心设计意图；② 一个从真实自对弈挖出的 peng 场景（修 bug 后裸分差仅
+2.6，远低于 pengHurdle=4），同样验证 hurdle 能正确拦截、且 hurdle=0 时会
恢复到旧行为。**踩坑记录**：手动用 `ids()` 按花色重建复杂真实局面时，手牌与
自己牌河两个独立的编号计数器各自从 copy0 开始，可能给"同花色"分配到完全
相同的 TileId，恰好触发 `safetyBonus` 的精确 ID 匹配（`visibleDiscards.includes(discard)`），
误判"这张手牌之前已经打过"——静默地把分数搞错而不报错。第二个 fixture 改用
从自对弈直接导出的原始 TileId 数组，不再按花色重建，规避这个陷阱。

`decision-diff:junk` 侦察（hurdle=0 vs 当前默认，20 种子、12222 决策点）：
分歧率 1.1%（131 例），全部是 chi/peng→pass 的单向翻转（75 pass +34 chi
+22 peng 类型分歧，没有反方向的），方向符合预期。`pnpm --filter @new-mj/ai
verify:full` 全绿（74 用例，含慢速 arena）。

## 待选（未选定顺序）

- **防守/放铳风险模型**：`safetyBonus`（`strategy.ts:265`）只对"现物"加固定
  分，没有对手危险度推理（副露/打牌节奏暗示听牌可能性、筋/壁牌相对安全推理），
  没有攻守切换逻辑，AI 永远单向最大化自己的进张——比番型权重更基础，是常见
  麻将 AI 强度短板。改动面大，第三档。
- **吃碰 EV 模型**：把 `fanPotential` 换成真正的期望倍数模型（枚举收尾番型
  分支×达成概率求和，复用 core `scoring.ts`），比 δ hurdle 准确但改动面大、
  单次决策计算量上升，与 Phase 2 同级。
- **Phase 2（远期 EV：轻量 2-ply → 必要时 Monte Carlo rollout）**：已选定并启动
  第一小步：先实现/基准测试仅模拟**自己的下一次自摸**的纯函数探针，输入为当前
  弃牌后的 13 张手牌；按每种未知牌的可见信息概率枚举下一摸、为每种结果选最佳
  后续弃牌、再用叶子手牌的形状质量评分。它不模拟两次行动之间的对手出牌、未来
  chi/peng 或真实终局番数；和牌进张的收益模型亦暂不在本步决定。`2-ply` 是评估
  框架，"进张后形状质量"是叶子评分手段，两者组合而非二选一。先写桥接目标牌型
  与死桥接/边张/番型受损反例 fixture，并记录性能基准；只有证实决策收益且成本能
  进入自对弈闭环，才讨论接入默认评分。核心 API 已具备（`scoreJunkHand`/
  `decomposeStandardWinningHand`/`decomposeSevenPairsWinningHand` 已是
  `@new-mj/core` 公开导出，不需要新增 core API）。未解决问题：触发的 shanten
  区间、是否/如何模拟对手行动与真实番数、"D 层后是否到达和牌"这类链式结果无
  闭式解。

  **第一小步已完成（2026-08-08，尚未提交）**：`strategy.ts` 新增仅供诊断的
  `probeSelfDrawTwoPly`，严格按上述边界枚举 34 种牌面并为非和牌分支求最佳后续
  弃牌；立即和牌概率单独报告，绝不伪造"和牌后再弃牌"的叶子值。`strategy.test.ts`
  的目标 fixture 验证：在相同三副顺子+对子背景下，`3m6m` 的 `4m` 桥接进张，
  其后续叶子分高于对照 `2m7m` 的同一进张；该断言刻意不宣称前者总 EV 更高（后者
  的首层覆盖面仍可能更宽）。反例锁定所有 `4m/5m` 已可见时探针不再将其列为进张，
  另有立即自摸和牌分支测试。

  **性能门槛未通过，暂不接入默认评分（2026-08-08）**：新增
  `pnpm bench:junk-two-ply [iterations]` 独立微基准入口，固定使用上述桥接
  fixture；100 次热态调用为 1508ms，约 **15.1ms/探针**（5 次冷态平均约
  85.9ms，主要含模块/表初始化）。`node --cpu-prof ...two-ply-benchmark-cli.ts 100`
  的有效样本集中在 core `ukeire`、其花色 DP（`applyTransition`/`buildSuitTable`）
  与 AI 的 `liveUkeireCount`；不再是 Vitest/Vite 噪声。约 14 个弃牌候选若都跑
  探针仍约 210ms/回合，不能进入 bot 决策或自对弈闭环。已有跨候选的 shanten memo
  不覆盖 `ukeire` 内部的主要成本，未发现不改变 fixture 语义的简单缓存/剪枝。
  **Phase 2 暂停**：探针保留作诊断工具；若重启，先向 Claude Project 提出 core
  "批量候选/多进张 ukeire 评估" API 与性能边界的架构提案，再决定是否实施，不能
  在 AI 层自行发明跨 core 的缓存契约。

  **性能优化重启（2026-08-09，进行中）**：按“先不改变语义的准备工作，再做
  core 批量 API”的顺序实施。第一轮已完成：core 新增 `evaluateUkeire`（一次返回
  shanten 与 improving kinds）及 `evaluateUkeireBatch`（按牌种 count signature
  去重）；AI probe 预计算副露/弃牌的 34 种牌计数，并在同一次 probe 中复用手牌
  分析。目标 fixture 的热态 benchmark 从约 15.1ms 降至约 10.1ms/probe，约
  1.5x，说明主要成本仍在重复的花色 DP，而不是 live-copy 扫描。

  当前实验性的“先删后加”共享 DP API 已完成等价测试。初版 batch 比逐叶评估
  慢约 1.44x；改为每个 discard 复用 removed-prefix 后，纯 core A/B 已接近持平
  （checksum 一致），但接入完整 AI probe 仍约 10.7ms/probe，略慢于约 10.0ms
  基线，因此未接入 AI 评分路径。下一步第一个具体动作：继续 profile batch 的
  prefix/tail 与候选 transition，只有取得明确净收益才接入 2-ply。

  **决策上下文方向（2026-08-09，待测量）**：AI 不应被设计成每次调用都从零开始
  的无状态函数。应由一局/一席的 policy 持有有界上下文，分层保存：① 可证明纯净、
  可跨回合复用的手牌结构分析（count signature → shanten/ukeire）；② 每回合必须
  重算的可见信息（牌墙、牌河、对手手牌数量、实际活牌数与概率）；③ 后续再评估的
  趋势/行为统计（对手副露、打牌节奏、危险度等），必须带时间衰减或明确生命周期，
  不能把旧局面结论当成当前事实。

  当前先落地第①层：`createJunkAnalysisCache` 提供有上限 LRU，`arena` 的每个
  `SeatPolicy` 独占一个 cache，并在每局开始清空；单局默认上限从 8192 收敛为 32
  （30 个 seed 的容量曲线显示 32 已接近平台，64 只多约 0.2 个百分点命中率）。
  缓存不含可见牌墙、活牌概率、安全度或隔离度结果，因而不会把过期局面分数直接复用。
  后续应记录早/中/残局的 hit/miss、size 与耗时，再决定是否把 cache/context 显式接入
  server 的 seat lifecycle；不先引入
  隐式全局 cache，避免跨玩家/跨牌局污染。趋势概率模型列为独立的决策质量课题，
  不与结构缓存混在一起验证。

  **阶段测量（2026-08-09）**：50 个 seed、每局清空 cache、容量 32 的真实 arena
  诊断中，早/中/残局命中率分别约为 **16.68%/18.67%/19.39%**。后期略高，符合
  手牌结构收敛后重复工作集变大的预期，但差异不大；cache 是低风险的局部收益，不能
  作为 10x 主路径。

  **同一决策复用审计（2026-08-09）**：20 个 seed 的 38,255 次结构分析请求中，
  同一次 `scoreLegalActions` 内重复 key 只有 100 次（约 **0.26%**），而总命中率
  约 17.07%。因此命中主要来自跨决策的同局结构复现，不值得再为同一回合增加一层
  AI 外壳 cache；下一步直接转向 core batch 的 prefix/tail 与 transition profile。

  **batch 接入试验（2026-08-09）**：在独立 core fixture 上，
  `evaluateUkeireAfterDiscards` 约 14.24ms/100 次，逐弃牌 `evaluateUkeire` 约
  24.40ms/100 次，局部约 1.7x；但把 batch 结果预填入完整 2-ply 的叶子分析 cache
  后，固定 benchmark 从约 9.97ms/probe 变为 10.90ms/probe，checksum 一致。
  说明 batch 算法本身有效，但当前批量构造成本与 cache/live-copy 交互抵消了收益，
  实验已撤回，暂不接入 AI 路径。下一步只在 core 内 profile remove-context、
  prefix/tail 和 transition 分配。

  **core 微优化（2026-08-09）**：`createTwoChangeShantenProber` 的每个 remove
  context 复用被删花色之前的 base prefix，只重放被改花色及其后缀；等价测试与
  `verify:full` 通过，固定 core fixture 从 14.24ms 降至 13.90ms/100 次，约 2.4%。
  收益有限但风险低，已保留；下一步继续检查 transition 分配与 remove/add 花色组合
  的共享，仍不接入 AI 主路径。

  **无用 suffix 优化（2026-08-09）**：`createTwoChangeShantenProber` 原本构造
  `baseSuffix[0]`，但所有路径只访问 `baseSuffix[addBlock + 1]` 或
  `baseSuffix[removeBlock + 1]`，因此下标 0 永远不会读取。跳过这一次 transition
  composition 后，固定 core fixture 从 14.34ms 降至 13.73ms/100 次，约 **4.2%**；
  checksum 一致，core `verify:full`（19 文件、191 测试、build）全通过，已接受。

  **嵌套 tail 合成优化（2026-08-09）**：继续 profile 后确认，同一个 remove
  context 的更早 add 花色 tail 是嵌套的。改为从 remove block 向左只合成一次链，
  消除重复的 `composeTransitions` 与临时 transition 分配；已有
  `evaluateUkeireAfterDiscards` 等价测试保持通过，独立 fixture 的 checksum 为
  `13800`。这是 core 内部语义等价优化，**接受并保留**。

  但完整 AI 2-ply benchmark 在当前运行态仍约 **13.60ms/probe**，且该 batch
  API 尚未接入默认评分，因此没有证据证明这条局部优化能让默认 AI 变快；“接入
  batch 到默认 2-ply”继续**拒绝**，Phase 2 仍暂停。AI `verify:full` 本轮未能作为
  通过证据：`policy-loader` 测试受沙箱 `spawnSync git EPERM` 阻塞，另一个
  `decision-diff` 测试在并行运行期间超出 5 秒时限；core `verify:full` 已全绿。

  **Phase 2 前置结构清理（2026-08-09）**：在继续设计 core 批量 API 前，接受先做
  无语义变化的模块拆分。`shanten-suit-table.ts` 原本同时承载单花色表构建、四花色
  DP 和 2-ply prober；已将 `createShantenProber`/`createTwoChangeShantenProber`
  移至 `shanten-prober.ts`，旧文件从 771 行降至 580 行。保留算法、表结构和调用
  语义，不删除未确认的内部导出，不引入新 2-ply 行为。

  验证结果：core `verify:full` 通过（19 文件、191 测试、slow fuzz、build），2-ply
  checksum 仍为 `-2411.856290493658`，100 次 benchmark 为约 **13.28ms/probe**，
  与拆分前约 13.60ms/probe 在运行波动范围内，无性能回归证据。后续若继续拆分，
  只考虑把单花色 solver/table-builder 再分离，不做机械式常量碎片化。

  **第二次拆分评估（2026-08-09）**：评估了继续把单花色 solver、索引和 table
  builder 拆成更多文件的方案。该方案需要再引入共享的索引/表类型模块，主要收益是
  文件长度下降，不能直接改善算法或 2-ply 性能，也会扩大内部导出和 import 边界。
  **拒绝继续拆分**；当前 `shanten-prober.ts` 已隔离变化最快的 2-ply 查询层，剩余
  `shanten-suit-table.ts` 是同一套 Layer 0 表构建与查询基础设施，保持在一起更容易
  审查不变量。后续只有在 batch API 明确需要独立的表构建生命周期时才重新评估。

### Phase 2 后续优化计划：从 AI 层微优化转向 core 批量算法

Phase 2 **尚未结束**。此前的 cache、count 预计算、remove-context、suffix 和
nested-tail 优化只是准备工作；其他 mobile、结算、Replay 等 Backlog 不代表 Junk
AI 优化已经收尾，也不属于本阶段。

按以下门槛继续推进：

1. **固定基线**：固定 2-ply fixture、checksum、完整探针耗时和决策输出，后续所有
   A/B 都使用同一基线，避免把局部 core benchmark 当成完整 AI benchmark。
2. **core 批量 API 提案**：设计一次处理多组“弃牌候选 × 34 种摸牌”的纯函数接口，
   共享 remove/add DP 状态，只返回 2-ply 所需的最小结构结果；不在 AI 层继续堆隐式
   缓存，也不把规则语义移入 AI。
3. **独立正确性/性能 A/B**：比较当前逐叶分析、现有
   `evaluateUkeireAfterDiscards` 与新 API；逐项结果必须一致，同时记录耗时、分配和
   内存。core 改动必须通过 `verify:full`，并包含至少 1000 局 fuzz。
4. **仅诊断接入**：先接入 `probeSelfDrawTwoPly`，验证 checksum、叶子结果和多
   seed 性能；未达到当前完整探针基线前，不进入默认评分。
5. **默认评分准入**：只有完整 2-ply 有端到端净收益、没有决策语义漂移，且场景化
   fixture/决策差异检查通过，才接受接入默认 AI；局部 batch 变快但完整 probe 变慢
   时，明确拒绝接入并记录原因。
6. **必要时升级算法**：若仍不够快，再评估整批叶子结构分析、增量活牌概率、只
   计算影响排序的候选，以及更专用的标准形 DP 查询接口；每一步仍先做独立 A/B，
   不预设 x10 已被证明。x10 是理论优化空间，不是承诺结果。

当前状态：第 1 步已具备历史基线，第 2 步待提案；在提案边界明确前，Phase 2
保持暂停，`垃圾胡性能优化讨论.md` 中的进取/保守策略不纳入本阶段。

### core 批量 API 提案（待架构确认）

**目标**：把当前 2-ply 中重复的“每个弃牌候选再枚举 34 种摸牌并独立分析”变为
一次共享结构计算；只提供 core 能证明正确的牌型距离结果，不把 AI 评分搬进 core。

**建议的最小输入**：

```ts
type TwoPlyStructureBatchInput = Readonly<{
  counts: readonly number[]; // STANDARD_TILE_SET 的 34 种牌计数
  discardKindIndexes: readonly number[];
  sevenPairs: boolean;
  existingMelds: number;
}>;
```

使用 count/index 而不是每个叶子重新传 TileId，目的是让 core 直接复用 remove/add
DP 状态；第一版只接受标准 34 种牌和显式 `existingMelds`，非标准 TileSet 继续走
现有通用路径，不在本提案中扩大范围。

**建议的最小输出**：每个弃牌候选返回自身的向听数，以及所有合法摸牌种类对应的
叶子结构分析：

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

实现可以用扁平数组或内部 scratch 降低分配，但对外必须返回独立、只读的结果，不能
暴露模块级 scratch 的引用。`improvingKindIndexes` 保留所有严格降低向听的摸牌种类，
包括“弃掉后又摸回同一种牌”的情况；此前反例已经证明不能凭直觉剪掉它。

**明确不放进 core 的内容**：

- `TileId` 选择、可见牌/活牌数量和墙中概率；
- `fanPotential`、安全度、门清损失、claim hurdle 与任何 `JunkWeights`；
- 对手行动、吃碰杠、终局番数、rollout 和动态攻守策略；
- 跨调用、跨玩家或跨牌局的隐式缓存。

**正确性门槛**：对固定 fixture、随机标准手牌和已有副露场景，将每个
`(discardKindIndex, addKindIndex)` 结果与独立构造叶子后调用现有
`evaluateUkeire` 的结果逐项比较；同时覆盖七对子开关、四张已满、立即和牌和
无效候选。core 改动必须通过 `verify:full`，其中包含至少 1000 局 fuzz。

**性能门槛**：先比较新 API 自身与逐叶 `evaluateUkeire`，再把它接到诊断用
`probeSelfDrawTwoPly` 做端到端比较。只有完整 probe 不慢于当前约 13.3–13.6ms 的
基线、checksum 与叶子结果一致，才有资格进入下一轮多 seed 测量；若局部 batch 变快
但完整 probe 变慢，拒绝接入。x10 仍是待测理论空间，不作为 API 的承诺目标。

**边界状态**：这是 core 性能/接口形状的架构提案，先标记 TODO 提回 Claude Project
确认；确认前不实现、不导出到默认 AI 路径。确认后再按“实现 API → 独立 A/B → 诊断
接入 → 默认准入”顺序推进。

**候选剪枝反例（2026-08-09）**：尝试跳过“弃掉某牌后再摸回同一牌种”，认为它
恢复原计数、不可能优于叶子；等价测试发现该判断错误——相对于弃牌后的 13 张手牌，
摸回同牌完全可能降低向听，因此该候选必须保留。剪枝只能基于实际的下界/支配证明，
不能用“恢复原手牌形状”的直觉替代。

- **自我优化基础设施推广到 hangzhou/bloodbattle**：可复用部分是 Layer
  B（打分求和）/C（强度旋钮）/D（自对弈引擎+调参算法）的实现模式，玩法专属
  Feature 抽取（对应各玩法番型/规则）仍需各自单独做，不会自动免掉。

## 历史细节（排查用，非当前待办）

`isolationPotential` 引入时的两次迭代（① 用"字牌不加分、数牌按 ±2 邻居给固定
分"修复"孤立字牌不优先打出"盲点；② 判断邻居改用弃牌前的 `referenceHand`，修复
"拆搭子制造新孤立牌"回归）完整背景见 git history 与 `strategy.ts:104-149` 顶部
注释，不再复述。
