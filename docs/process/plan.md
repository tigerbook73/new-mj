# 待完成任务与当前状态

> 本文件只记录当前专题、当前状态和下一步；未选定候选统一见 `backlog.md`。

## 当前任务

当前专题是把已经验证的普通标准型结构策略纳入 Junk 生产入口。先完成统一影子 facade、全合法动作覆盖、性能门禁和 weighted/structural A/B，再用独立提交切换默认；生产当前仍是现有加权策略，`isolationPotential` 保持 `1.5`。

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
- 新候选已从 Junk facade 导出供后续显式评估，但 `recommendJunkAction`/`chooseJunkAction` 尚未切换。当前生产化范围只包括普通标准型的 discard、claim、gang 与 hu/zimo；七对、番型收益、防守和其他玩法路线全部延后，不作为本轮切换的前置条件，也不得混入本轮评分。
- `structural-bounded@v1` evaluation adapter 已接入 canonical `scenario run` 和 generated/snapshot `scenario batch`；报告保留全部首弃的一层指标、支配/截断标记、实际搜索数、2-ply 聚合指标及最终选择。`discard-001` 真实 CLI 冒烟七路全成功，bounded 选择与当前生产均为 `5p`，单次信息性耗时约 `40.8ms`；报告写入临时目录，不归档。
- `bounded-structural-teacher-v1` 固定开发/留出 split、动作一致率、全部差异 seed、teacher 相对 bounded 的四项结构差值，以及两路 P50/P95；门槛是两组一致率均不低于 `99%` 且 bounded/full P95 比值均不高于 `0.6`。默认每组 1000 个样本，只走人工慢速 evaluation，不进入 `verify`。
- seed `20260814` 的 1000 个开发场景 bounded/full 一致 `1000/1000`，平均搜索 4.30 个首弃，P50/P95 为 `27.37/33.85ms`，full 为 `85.33/95.41ms`，P95 比值 `0.355`；seed `20260815` 的 1000 个留出场景一致 `999/1000`，平均搜索 4.31 个，P50/P95 为 `26.93/33.41ms`，full 为 `83.46/94.51ms`，比值 `0.354`。唯一差异 seed `3520660970` 的立即完成与条件期望向听相同，teacher 仅多约 `0.066` 条件期望进张种类和 `0.131` 张；当前固定上限 5 通过近似门槛，但不声称等价于 full。报告位于临时目录，不归档。
- `structural-claim.ts` 提供未接入默认入口的 `hu + chi/peng/minGang + pass` 影子候选：pass 比较当前 13 张保留结构，chi/peng 模拟副露并枚举下一弃牌后比较最佳普通牌型向听、存活进张种类和张数；claim 必须严格更好，结构打平时 pass。既有 fixture 已覆盖并通过“chi 破坏听牌则 pass”“peng 后进入听牌则 claim”“等宽等向听 chi 则 pass”；hu 始终优先。anGang/buGang、七对、番型和防守仍不在新路径。
- minGang 不获得固定奖励：移除三张同 kind 手牌并增加一个副露后，按本人可见剩余副本枚举至多 34 种补牌；已完成质量优先，其余分支枚举至多 11 种不同 kind 弃牌并聚合条件期望最佳向听、进张种类和张数。pass 以零立即完成质量和当前结构参与固定字典序，浮点比较使用 `1e-12` 容差；无最近弃牌、手中不足三张、无未知副本或墙空时 minGang 不支持并 pass。预算由 `34 × 11` 固定，不按墙钟时间截断；该质量仍是信息集估计，不是真实杠尾概率或终局 EV。
- snapshot provider 已支持版本化 `chi/peng/minGang/hu/pass/anGang/buGang/zimo` legal action；四条 claim 边界已升级为 canonical snapshot。`structural-claim@v1` adapter 已接入当前九路 `scenario run`、batch allowlist 和 worker task，并报告 minGang 补牌分支数、叶子数和聚合结构。`claim-mingang-replacement-001` 中 3s 四张均可见，候选枚举其余 33 种补牌、31 个非完成叶子，立即完成质量 `0.06557377049180328`，条件结构为 0 向听、2 种/8 张；结构候选用约 `9.28ms` 选择 minGang，当前生产仍选择 pass。报告位于临时目录，不归档。
- `structural-turn.ts` 提供未接入默认入口的 `zimo + anGang/buGang + discard` 影子候选。anGang 移除四张同 kind 暗牌并新增副露，buGang 移除 action tile 并升级既有 peng；两者共用固定最多 `34 × 11` 的补牌 continuation，同时必须严格胜过 bounded 最佳弃牌及各自等价弃牌，避免五候选截断制造虚假 gang 优势。zimo 始终优先，打平时 discard。
- `self-gang-equivalence-001` canonical 同时覆盖 anGang 和 buGang：32 种补牌下，buGang 与打掉第四张的聚合结构完全相同；anGang 因锁死可拆暗刻，条件期望进张结构反而弱于直接弃一张。生产和结构候选均选择弃 `1m`；`structural-turn@v1` 报告全部 13 个动作并用约 `42.03ms` 完成，九路 CLI 全成功。报告位于临时目录，不归档；这证明纯标准结构不会主动 gang，未来若要选择 gang，必须在独立 slice 显式加入番型、抢杠或行动时机价值，而非恢复固定权重奖励。
- Core 的 `sevenPairs: true` 是 standard 与 seven-pairs 取最小值的合并开关，不保留路线身份。已建立的 `structural-routes.ts` 及六对单张单测只保留为后续可复用的独立诊断资产；按当前范围决定，它不接入 bounded 2-ply、统一 facade 或生产入口，七对生产化转入 backlog。
- 普通型生产化采用两阶段切换：先新增 `recommendStructuralJunkAction` 统一编排 hu/zimo、claim、self-turn/discard 和 draw 等流程动作，并在真实 core 对局中证明对每个非空 legalActions 都返回其中一个合法动作；再测完整对局 P50/P95 与 weighted/structural 同 seed A/B。A/B 用于发现严重退化、死循环和明确普通牌理反例，不把七对、番型或防守差异误判为本轮实现 bug。
- 统一 facade 通过合法性、性能与 A/B 门禁后，才在独立提交把 `recommendJunkAction`/`chooseJunkAction` 默认切到普通型结构策略；旧 weighted 策略及 `default-weights.json` 保留为显式 legacy/evaluation 基线，暂不删除，确保可重复对照和安全回退。
- `recommendStructuralJunkAction` 已作为公开但不接管默认的完整影子 facade 落地：空动作返回 undefined，hu/zimo 优先，draw 直接透传，claim 上下文路由 `structural-claim`，playing 上下文路由 `structural-turn`；子策略异常缺失时仅回退到传入列表首项，不构造动作。真实 core seed `20260816` 完整对局逐决策验证了非空 legalActions 均返回其中一个动作且可被 core 接受；该跨模块用例标记为 slow。
- evaluation 新增单进程 `structural compare`：每个 seed 复用相同牌墙/庄家序列跑两场换位 match，structural 分别坐 0/2 与 1/3，按策略汇总分数、胜场、失败、步数上限及 weighted/structural 单次决策 P50/P95/max；报告保存全部 seed/split，写临时目录且不改生产入口。固定筛查门槛为 15 seeds / 30 场无失败、structural P95 不高于 50ms、总分不低于 weighted，且 canonical 普通型 fixture 无明确回退。
- 顶层 seed `20260816` 的 3 seeds / 6 场小样本全部完成且无步数上限；structural/weighted 总分 `1/-1`、胜场 `3/3`，质量信号不确定。单次决策 structural P50/P95/max 为 `0.445/27.618/43.735ms`，weighted 为 `0.260/21.469/340.294ms`；结构 P95 慢约 29%，但低于 50ms 筛查线，也未出现 full 2-ply 式失控。报告位于 `/tmp/new-mj-structural-ab`，不归档。
- 顶层 seed `20260815` 的正式 15 seeds / 30 场门禁无失败或 500 步上限；structural P50/P95/max 为 `0.272/26.307/381.883ms`，weighted 为 `0.249/22.706/65.129ms`，结构 P95 通过 50ms 性能线。structural/weighted 总分 `-21/21`、胜场 `12/16`、2 平，质量门禁失败，当前不得切生产。split 汇总是 structural 坐 0/2 时 `+11`（9 胜 4 负 2 平）、坐 1/3 时 `-32`（3 胜 12 负）；换位总和仍是采纳依据，但差异明显集中于 split，不能直接解释为某项普通牌理缺陷。7 个 canonical 普通型结构测试文件共 22 tests 全绿，未发现既有固定 fixture 回退；报告位于 `/tmp/new-mj-structural-ab`，不归档。
- 独立顶层 seed `20260817` 的扩大验证覆盖 50 seeds / 100 场换位 match，仍无失败或步数上限；structural P50/P95/max 为 `0.260/26.590/46.935ms`，weighted 为 `0.250/22.894/337.735ms`，性能结论稳定。structural/weighted 总分 `-181/181`、胜场 `28/61`、11 平；50 个配对 seed 中 structural 净正 14、净负 35、1 平。structural-even/odd 分别为 `-90/-91`，说明大样本质量落后并非先前 split 不对称造成。筛选 2-ply 性能足够，但当前纯结构普通型策略明确未通过质量门禁，生产继续使用 weighted。
- evaluation 新增 `structural trace`，在真实 mixed-policy 轨迹的同一个 `PlayerView + legalActions` 上同时计算 weighted/structural，并保存全部分歧的 round/step/seat、driver、完整 view、合法动作和两路选择；shadow 动作不应用到 core，因此只比较当前节点，不声称后续轨迹相同。seed `2889165442` 两个 split 精确复现 structural `-15/-4`，665 个决策点中有 170 个分歧（25.6%）：148 个 discard->discard、18 个 pass->peng、3 个 pass->chi、1 个 chi->chi，无 win/draw/gang 分歧。
- 目标 trace 未发现违反现有结构排序的实现错误：首个弃牌分歧中两路条件期望向听相同，结构选择的进张种类/张数更高；18 个 pass->peng 中 13 个降低 1 向听、5 个同向听扩大进张，3 个 pass->chi 中 2 个降低 1 向听、1 个同向听扩大进张。当前证据不能把失分归因给某个节点，较可能是纯结构目标遗漏价值或 discard/claim 组件交互；报告位于 `/tmp/new-mj-structural-trace`，不归档。

## 下一步第一个具体动作

建立普通型结构组件消融 slice brief：新增两个仅供 evaluation 的混合 facade——weighted claim + structural turn/discard，以及 structural claim + weighted turn/discard；先用独立 15 seeds / 各 30 场换位 match 与全 weighted 基线比较，保持 win/draw 路由一致，分别报告分数、胜场、失败和逐 split 结果，以定位质量损失主要来自 discard 还是 claim，不调权重、不改结构算法且不切生产默认入口。

## 阻塞与遗留问题

- 当前没有阻塞；尚未解决但未被选定的工作统一保留在 `backlog.md`。
