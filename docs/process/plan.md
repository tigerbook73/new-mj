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

## 当前状态

当前步骤：1. AI/Junk 测试盘点与职责重分类。

专门计划：[步骤 1：测试盘点与职责重分类](junk-ai-structural-calibration-step-01-test-inventory.md)。

本步骤先建立全部测试的责任矩阵，再实施不损失覆盖的低风险重分类；存在语义取舍的移动、合并或删除会给出建议与备选，不自行决定。

已完成三批重分类：policy capture、decision-diff、tuning 和 policy-loader 已按 unit/integration/slow 分层；evaluation runner 的 5 个通用契约与 2 个 Junk fixture/worker 集成断言也已拆分，覆盖不变。

影响后续判断的结论：

- 通用 `packages/ai/src/evaluation/` 拥有 manifest/report/comparator、JSONL、worker executor 和 resumable batch/checkpoint 契约；玩法层只注入 provider、evaluator task 和输出命名。
- Junk canonical fixture 与固定可见状态 snapshot 共用 manifest/runner/report 主链；production-weighted、one-ply-all、two-ply-all 在同一 content hash 下形成三路对照。
- 两个场景 × 三路 evaluator 共六份版本化 baseline；文件名使用 `<scenario-id>.<evaluator>.v<baseline-revision>.baseline.json`，决策和候选集合是回归字段，耗时仅供参考，baseline 不由命令自动创建或覆盖。
- 批量失败通过报告与 hash-safe checkpoint/resume 重跑；不自动 retry 确定性错误，不采集容易误导的跨 worker CPU/resource 汇总。
- generated source 只预留 schema；generator/provider 明确归入路线图步骤 5，不在平台步骤提前定义牌型生成语义。三路 evaluator 若需随无权重结构契约调整，在后续步骤重新评审，不回改 step 0 基线语义。

下一步第一个具体动作：整理 Junk evaluation adapter 测试：将 baseline/三路 evaluator 的跨模块回归移入 `test/`，并拆开 fixture/snapshot provider unit 与真实 runner 接线。

## 专题路线图

每一步开始前，结合当时状态补充该步骤的专门计划；未开始的步骤不提前实现或标记完成。步骤完成后，只在本文件保留结果、证据、限制和对后续步骤有影响的判断。

0. 已完成：可重复的基线 bench 与验证平台
1. [当前：AI/Junk 测试盘点与职责重分类](junk-ai-structural-calibration-step-01-test-inventory.md)
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
