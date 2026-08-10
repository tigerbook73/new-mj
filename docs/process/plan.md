# 待完成任务与当前状态

> 本文件是当前专题的计划文档：记录目标、步骤、当前状态、影响后续判断的完成结论和遗留问题。候选专题统一见 `backlog.md`；专题完整结束后按 workflow 将仍有耐久价值的内容分流到架构、契约或测试文档。

## 当前任务

当前专题：普通胡牌基础牌形校准。

目标：把标准普通牌型的结构判断从统一加法分数中分离出来，自动发现明显牌理错误；保留当前 2-ply 作为未来牌形评价器，不把它称为完整胡牌概率或终局 EV。

范围：第一阶段只研究 `standard-only` 普通标准牌型，不引入清一色、混一色、七对、碰碰胡或防守目标的联合调优。生产模式保持当前固定规则、默认权重和 `twoPly: true` 行为不变。

### 首个 slice：可重复基线 bench 与验证平台

验收标准：

- 固定一组 canonical fixtures、自动生成样本种子和代表性实战 snapshot；
- 对每个样本分别记录生产版权重筛选、无权重全量候选和现有 2-ply 的候选数、决策结果、运行时间、缓存命中和报告版本；
- 增加结构指标、候选比较、决策差异和报告格式的最小测试；
- 大样本扫描和全量 2-ply 仅通过独立 CLI/slow 用例手动运行，不进入普通 `pnpm verify`；
- 该平台只服务本专题，先不改变生产策略，也不把随机自对弈结果当作基础牌形真值。

不可违反约束：

- 诊断与生产路径分离；未完成等价验证前不改评分公式、默认权重、候选筛选或 AI 对外行为；
- 规则实现仍集中在 core，AI 只消费 core 提供的标准牌型能力；
- 诊断必须明确区分玩家视角估计、牌山/公开信息上下文和完整胡牌概率；
- 测试与实现同一 commit；若修改 core，按 testing strategy 增加至少 1000 局 fuzz 冒烟；
- 每个当前步骤开始前，可建立一份临时专门计划；步骤完成后只把影响后续判断的结论归并到本文件，不保留过程日记。

已知未知项及最早验证：

- 现有策略测试混合了结构契约、策略回归和 2-ply 行为；首个 slice 先盘点并建立基线，不先删除或迁移覆盖；
- `StructuralMetrics` 的字段和概率上下文尚未定稿；先以只读报告和 canonical fixture 验证字段是否足够解释候选差异；
- 结构指标与生产权重可能产生冲突；先记录差异和非支配关系，不预设“向听差 1/2”或 `isolationPotential` 的权重结论；
- 最早验证：完成一个手写 fixture、一个代表性 snapshot 和一个报告样例，证明三种候选路径能被重复运行并比较。

## 当前 slice 专门计划

当前步骤：0. 建立可重复的基线 bench 与验证平台。

专门计划：[step 0：基线 bench 与验证平台](junk-ai-structural-calibration-step-00-baseline.md)。

本步骤完成条件与下一动作见专门计划文件。当前已完成现有工具的只读输入/输出边界盘点，尚未写新的 bench runner。步骤完成后，删除该临时计划文件，并将结果摘要归并到本文件。

### 已完成的关键盘点（step 0）

- 可复用：`playJunkMatch`/`strengthPolicy` 的确定性自对弈驱动、`runMatchTask`/`runPolicyMatchTask` 的纯任务单元、`MatchWorkerPool` 的有界 `worker_threads` 调度、`policy-loader` 的代码版本/权重加载，以及现有顺序与并行结果等价测试。
- 可复用但需 adapter：`arena` 目前只返回累计分数和排名；`decision-diff` 只面向两策略自对弈决策分歧；`tune` 的报告和任务围绕权重搜索；它们可提供执行/比较积木，但不能直接作为结构校准平台契约。
- 不直接复用：`snapshot-junk-cli` 是未提交代码的 scratch 复制工具，不是 baseline 资产库；现有各 CLI 的参数解析和文本报告是一次性入口，不能让每个新场景继续复制格式逻辑。
- 测试现状：arena、tune、worker pool、decision-diff 和 snapshot 已有 slow/冒烟覆盖，能证明管线连通和部分确定性；尚未覆盖统一 manifest、场景级任务 ID、报告 schema、失败重跑、baseline 比较和批量性能分位数。
- 性能现状：worker pool 已通过同一任务函数实现顺序/并行等价，但结果类型只表达成功/失败和分数，缺少任务 ID、耗时、重试、进度和可诊断错误；`runAll` 保持输入顺序聚合，但尚未形成通用批量报告。
- 命名结论：现有文件名/函数名不作为兼容约束；后续可按“场景、评估器、任务执行、报告、baseline”职责重命名或拆分，外部命令只需提供迁移说明。
- 最小契约验证已完成：新增 `packages/ai/src/junk/calibration/` 下的 manifest、统一 evaluation result、versioned report 类型，以及稳定排序的 JSON 和固定 Markdown 摘要；两个契约测试证明 worker 完成顺序不会改变报告顺序，摘要能直接显示场景、评估器、状态、选中候选和耗时。
- 初始契约验证结果：calibration 定向测试 2/2 通过，AI typecheck 通过，AI lint 通过；当时尚未接入真实 fixture、现有 evaluator adapter、批量 runner 或 worker pool。
- provider 边界已确定：场景来源使用 `ScenarioProvider`，评估逻辑使用 `EvaluatorProvider`，单线程/worker 使用统一 `Executor`；baseline/候选差异使用纯 `Comparator`，JSON/Markdown 使用 `ReportWriter`，性能采集是横切 wrapper，不单独复制一套测试类型。
- 场景来源统一用带 `kind` 的 source 描述（fixture/snapshot/generated/replay），再解析为 `NormalizedScenario`；step 0 先适配现有 `JunkPlayerView + legalActions` 的生产 evaluator，step 2 再决定更底层的结构诊断输入，不提前锁死 `StructuralMetrics`。
- 不为每种测试建立独立 runner；fixture、snapshot、generated、replay 是场景来源的不同 provider，生产权重、`standard-only`、2-ply、decision diff 是 evaluator provider，baseline 是比较层而不是 evaluator。
- 正式 AI play 的 player 上下文与缓存观测不属于当前 bench step，已作为独立 backlog 记录；当前平台只保留评估运行所需的 cache/performance 摘要。
- source provider 已落地为判别联合并支持 `NormalizedCalibrationScenario`；当前 fixture provider 只解析 `fixture` source，其他来源会显式失败，不会静默当作 fixture。
- 已接入第一个真实 canonical fixture 和生产 evaluator adapter：复用现有 `chooseJunkAction(JunkPlayerView, legalActions)`，默认确定性 argmax，只验证合法且可重复的生产决策，不提前定义结构指标。
- 上一轮验证结果：calibration 2 个测试文件、4/4 测试通过，AI typecheck 通过，AI lint 通过；当时仍未串接完整单场景 report runner，也未接入批量 runner/worker pool。
- 单场景 runner 已落地：按 manifest 查找 scenario，调用 provider 和 evaluator，再生成统一 JSON/Markdown report；runner 不包含业务评分、并发、重试或文件 I/O。
- 本轮验证结果：calibration 3 个测试文件、6/6 测试通过，AI typecheck 通过，AI lint 通过；报告链路已用真实 fixture 验证，仍未接入稳定 CLI、批量 runner、baseline 存储或 worker pool。
- canonical fixture 已提取为 registry 和稳定 manifest；AI 包内 CLI 现支持 `list`、`run <scenario-id>`、`--output-dir <dir>`、`--run-id <id>`，同时写 JSON 原始报告和 Markdown 摘要，已有 run ID 不覆盖，默认临时产物目录为 `packages/ai/.calibration-runs/`。
- 本轮验证结果：calibration 4 个测试文件、8/8 测试通过，AI typecheck/lint 通过；真实命令 `pnpm --filter @new-mj/ai evaluate list` 与单 scenario 输出冒烟均通过。CLI 仍是单线程，不负责 baseline 登记/比较、批量调度或 worker pool。
- 命令归属结论：calibration 是 `@new-mj/ai` 的包内能力，canonical script 放在 `packages/ai/package.json`；root 不新增快捷命令，临时输出忽略规则也放在 `packages/ai/.gitignore`。
- canonical scenario 设计结论：scenario 本身必须是纯数据，代码只负责 schema 校验、牌种到 TileId 的转换、`JunkPlayerView`/合法动作构造和 evaluator；当前 `canonical-fixtures.ts` 仅是临时原型，step 0 完成前必须迁移为版本化 manifest/fixture 数据文件，并补 `contentHash`。
- canonical 数据迁移已完成：manifest 与 fixture 使用版本化 JSON，fixture 数据只表达牌种、动作副本和玩家视角字段；provider 负责通用校验、TileId 构造和稳定 `sha256:<hex>` 内容哈希，报告 evaluation 记录 `scenarioContentHash`，Markdown 摘要也显示该哈希。
- 迁移验证结果：calibration 4 个测试文件、10/10 测试通过，AI typecheck 与 lint 通过；现有 canonical 生产 evaluator 仍返回同一类合法、确定性决策。数据文件新增场景时不需要修改 provider 或 runner 代码。
- manifest 说明已补齐：manifest 增加 `purpose`/`description`，scenario 增加可读 `description`/`tags`，并新增 calibration README 解释当前 canonical-baseline 的用途、字段和已实现/未实现的 source 类型；README 同时明确当前 loader 仍需显式注册 fixture。
- 大数据格式边界已记录：manifest 和少量 canonical fixture 使用 JSON；大量 generated/snapshot/replay 场景使用一条记录一行的 JSONL，以支持流式读取、按行校验、分片分发和失败场景重跑。JSONL 记录必须自包含且报告按稳定 scenario ID 聚合排序；`.jsonl.gz` reader 留给批量 runner，不在当前单场景入口临时实现。
- 当前单场景 baseline 已登记为版本化资产：保存 manifest/scenario 版本、`scenarioContentHash`、evaluator 版本、期望动作和合法动作数；决策与候选数量作为可比较结果，耗时仅作信息指标，baseline 文件不由运行结果覆盖。

下一步第一个具体动作：设计不依赖逐个 import 的通用 fixture registry，并明确 JSONL reader 的记录 schema、分片和稳定聚合边界；先不实现大批量 worker pool。

## 专题路线图

每一步开始前，结合当时状态补充该步骤的专门计划；未开始的步骤不提前实现或标记完成。步骤完成后，只在本文件保留结果、证据、限制和对后续步骤有影响的判断。

0. [当前：可重复的基线 bench 与验证平台](junk-ai-structural-calibration-step-00-baseline.md)
1. 待开始：AI/Junk 测试盘点与职责重分类
2. 待开始：只读 StructuralMetrics 诊断契约
3. 待开始：结构分析、2-ply 与动作评分模块边界
4. 待开始：人工确认的 canonical fixtures
5. 待开始：自动牌型生成器与样本报告
6. 待开始：保守 Pareto 支配诊断/过滤
7. 待开始：无权重全量 2-ply 三路诊断对照
8. 待开始：isolationPotential 影响边界校准
9. 待开始：普通路线的 paired-seed 与 held-out 验证
10. 后续独立专题候选：番型路线收益模型可行性；不在本专题自动启动

## 阻塞与遗留问题

- 尚无阻塞；若发现需要改变 RuleSet 接口、协议语义或跨层边界，暂停实现并标 TODO 提回架构决策。

## 后续事项

候选专题统一见 [`backlog.md`](backlog.md)，不从候选列表自动选择下一项；由用户明确指定后再建立新的 `plan.md` 当前任务。
