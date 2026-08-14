# 待完成任务与当前状态

> 本文件只记录当前专题、当前状态和下一步；未选定候选统一见 `backlog.md`。

## 当前任务

当前没有已选定专题。普通胡牌基础牌形校准已完成；番型路线收益模型仍是独立候选，不自动启动。

## 当前状态

普通胡牌基础牌形校准的步骤 0、0b、1—9 已全部完成，生产默认权重、评分公式、候选筛选和 AI 对外行为均未改变。

影响后续工作的耐久结论：

- Core 提供普通标准牌型的向听与进张结构事实；AI evaluation 的 `standard-only@v2`、Pareto、结构 2-ply 和 isolation paired 诊断只读消费这些能力，不把可见剩余张数、下一摸立即完成质量或条件期望向听称为真实牌墙概率、整局胡牌概率或终局 EV。
- `packages/ai/src/evaluation/` 负责通用 manifest、JSONL、worker、checkpoint 和报告；Junk evaluator/CLI 位于 `packages/ai/src/junk/evaluation/`。生产模块不得依赖 evaluation，具体命令、版本和指标边界以其 README 为准。
- canonical fixture、固定中盘 snapshot 和 `standard-concealed-v1` 确定性生成器已覆盖生产、全候选加权、普通结构、加权 2-ply、结构 2-ply 与 isolation 边界六路诊断。generated 样本用于发现差异，不是牌理真值或实战分布。
- `paired-standard-heldout-v1` 固定逐场景配对基线/候选，并校验开发集与留出集的场景 seed、内容 hash 不重叠；当前结构门禁统计生产选择是否在同向听层被另一候选以存活进张种类和张数严格支配。报告只读，不写默认权重；通过结构门禁仍需独立胜率 A/B 和人工 fixture 才能采纳生产变化。
- 固定开发 seed `20260814` 与留出 seed `20260815` 各 100 个样本的重复运行数据完全一致。关闭 `isolationPotential` 的探针在开发集改变 34 个决策，结构支配错误为基线 12、候选 12；留出集改变 24 个决策，错误为基线 8、候选 7。探针通过狭义结构门禁，但没有胜率/EV 或人工牌理证据，因此未采纳。
- 大规模生成扫描、全候选 2-ply、调参与自对弈继续只走人工 evaluation 命令，不进入普通 `pnpm verify`；当前报告产物和生成样本均为可重建临时数据，不归档进仓库。

## 下一步第一个具体动作

等待用户从 [`backlog.md`](backlog.md) 明确指定下一专题；收到选择后读取对应条目并建立新的当前专题计划。在用户选择前不启动“番型路线收益模型可行性”或其他候选。

## 阻塞与遗留问题

- 当前没有阻塞；尚未解决但未被选定的工作统一保留在 `backlog.md`。
