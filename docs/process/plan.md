# 待完成任务与当前状态

> 本文件只记录当前专题、当前状态和下一步；未选定候选统一见 `backlog.md`。

## 当前任务

当前专题是逐步建立新的纯结构 Junk 策略。“弃牌-only 的 bounded 2-ply 影子候选”slice 已完成；生产默认仍是现有加权策略，`isolationPotential` 保持 `1.5`。

## 当前状态

基础牌形校准和 isolation 直接删除评估已经完成，生产评分公式和 AI 对外行为未改变。

影响后续工作的耐久结论：

- Core 提供普通标准牌型的向听与进张结构事实；AI evaluation 的 `standard-only@v2`、Pareto、结构 2-ply 和 isolation paired 诊断只读消费这些能力，不把可见剩余张数、下一摸立即完成质量或条件期望向听称为真实牌墙概率、整局胡牌概率或终局 EV。
- `packages/ai/src/evaluation/` 负责通用 manifest、JSONL、worker、checkpoint 和报告；Junk evaluator/CLI 位于 `packages/ai/src/junk/evaluation/`。生产模块不得依赖 evaluation，具体命令、版本和指标边界以其 README 为准。
- canonical fixture、固定中盘 snapshot 和 `standard-concealed-v1` 确定性生成器已覆盖生产、全候选加权、普通结构、加权 2-ply、结构 2-ply 与 isolation 边界六路诊断。generated 样本用于发现差异，不是牌理真值或实战分布。
- `paired-standard-heldout-v1` 固定逐场景配对基线/候选，并校验开发集与留出集的场景 seed、内容 hash 不重叠；当前结构门禁统计生产选择是否在同向听层被另一候选以存活进张种类和张数严格支配。报告只读，不写默认权重；通过结构门禁仍需独立胜率 A/B 和人工 fixture 才能采纳生产变化。
- 固定开发 seed `20260814` 与留出 seed `20260815` 各 100 个样本的重复运行数据完全一致。关闭 `isolationPotential` 的探针在开发集改变 34 个决策，结构支配错误为基线 12、候选 12；留出集改变 24 个决策，错误为基线 8、候选 7。探针通过狭义结构门禁，但没有胜率/EV 或人工牌理证据，因此未采纳。
- isolation=0 的标准自对弈 A/B 使用 seed `20260815` 的 15 个种子、30 场换位配对，候选总分 `36`、基线 `-36`，候选胜率 `56.7%`；该小样本是支持信号但不是单独采纳依据。canonical `discard-001` 给出相反且明确的牌理反例：默认弃 `5p` 为 2 向听、15 种/50 张存活进张，isolation=0 改弃 `1m`，同为 2 向听但仅 9 种/31 张，并被弃 `5p` 严格支配。因此直接删除未通过人工 fixture 门槛，默认 `1.5` 保留。
- paired JSON 现在保存全部决策变化及基线/候选结构支配错误的生成场景 seed，可用 `standard-concealed-v1` 重建人工复核；报告数据仍为临时可重建产物。
- 大规模生成扫描、全候选 2-ply、调参与自对弈继续只走人工 evaluation 命令，不进入普通 `pnpm verify`；当前报告产物和生成样本均为可重建临时数据，不归档进仓库。

- `structural-discard.ts` 提供未接入默认入口的普通牌型弃牌候选：一层删除同向听下被存活进张种类/张数严格支配的候选，再按向听、进张种类、进张张数的确定性顺序最多搜索 5 个首弃；第二层与最终选择也使用固定字典序，不消费 `JunkWeights` 或 evaluation。概率加权聚合使用固定 `1e-12` 比较容差消除浮点累加噪声，容差内继续比较下一项结构指标。
- 同一 API 关闭支配过滤并把首弃上限设为无限时作为离线 full teacher。canonical `discard-001` 和中盘 `discard-snapshot-001` 中 bounded/full 分别一致选择 `5p`、`1z`；单元测试固定搜索上限和“不搜索被支配首弃”不变量。
- 原上限 4 的三处 bounded/full 差异均来自一层指标完全相同的候选在截断边界两侧，且条件期望向听存在约 `2e-16` 的累加噪声；可复现 seed `1077643932`、`1351392336`、`537634752` 已固化为回归用例。上限 5 加固定浮点容差后，seed `20260814`/`20260815` 各 100 个场景均达到 bounded/full `100/100` 一致，平均搜索 4.38/4.39 个首弃，扫描约比 full 快 `2.84`/`3.20` 倍。生成样本和扫描报告仍是临时可重建数据，不归档。
- 结构候选只使用本人可见信息：手牌、所有公开牌河与副露按 `TileId` 去重后估算剩余副本。它不读取真实牌墙、对手暗手或推测分布，因此是信息集结构估计，不是实战摸牌概率或终局 EV。
- 新候选已从 Junk facade 导出供后续显式评估，但 `recommendJunkAction`/`chooseJunkAction` 未切换；claim、番型、七对和防守仍未进入新路径。
- `structural-bounded@v1` evaluation adapter 已接入 canonical `scenario run` 和 generated/snapshot `scenario batch`；报告保留全部首弃的一层指标、支配/截断标记、实际搜索数、2-ply 聚合指标及最终选择。`discard-001` 真实 CLI 冒烟七路全成功，bounded 选择与当前生产均为 `5p`，单次信息性耗时约 `40.8ms`；报告写入临时目录，不归档。
- `bounded-structural-teacher-v1` 固定开发/留出 split、动作一致率、全部差异 seed、teacher 相对 bounded 的四项结构差值，以及两路 P50/P95；门槛是两组一致率均不低于 `99%` 且 bounded/full P95 比值均不高于 `0.6`。默认每组 1000 个样本，只走人工慢速 evaluation，不进入 `verify`。
- seed `20260814` 的 1000 个开发场景 bounded/full 一致 `1000/1000`，平均搜索 4.30 个首弃，P50/P95 为 `27.37/33.85ms`，full 为 `85.33/95.41ms`，P95 比值 `0.355`；seed `20260815` 的 1000 个留出场景一致 `999/1000`，平均搜索 4.31 个，P50/P95 为 `26.93/33.41ms`，full 为 `83.46/94.51ms`，比值 `0.354`。唯一差异 seed `3520660970` 的立即完成与条件期望向听相同，teacher 仅多约 `0.066` 条件期望进张种类和 `0.131` 张；当前固定上限 5 通过近似门槛，但不声称等价于 full。报告位于临时目录，不归档。
- `structural-claim.ts` 提供未接入默认入口的 `hu + chi/peng + pass` 影子候选：pass 比较当前 13 张保留结构，chi/peng 模拟副露并枚举下一弃牌后比较最佳普通牌型向听、存活进张种类和张数；claim 必须严格更好，结构打平时 pass。既有 fixture 已覆盖并通过“chi 破坏听牌则 pass”“peng 后进入听牌则 claim”“等宽等向听 chi 则 pass”；hu 始终优先。minGang 因补牌分支尚未建模而保守 pass，anGang/buGang、七对、番型和防守仍不在新路径。

## 下一步第一个具体动作

为 `structural-claim` 增加独立 evaluation adapter 和版本化 chi/peng/pass canonical fixture，使影子候选能与当前生产策略显式对照；不得接入默认生产入口。

## 阻塞与遗留问题

- 当前没有阻塞；尚未解决但未被选定的工作统一保留在 `backlog.md`。
