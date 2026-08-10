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
- 本次验证结果：calibration 定向测试 2/2 通过，AI typecheck 通过，AI lint 通过；尚未接入真实 fixture、现有 evaluator adapter、批量 runner 或 worker pool。

下一步第一个具体动作：用一个真实 canonical fixture 接入一个现有 evaluator adapter，生成第一份真实 calibration report；先保持单线程和只读路径，不接入批量 runner 或 worker pool。

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
