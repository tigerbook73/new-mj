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

步骤 0b AI evaluation 工具统一收口与步骤 1 测试职责重分类均已完成。下一阶段为步骤 2：只读 `StructuralMetrics` 诊断契约；开始前先建立对应临时专门计划，不在工具收口提交中提前实现。

影响后续判断的结论：

- 通用 `packages/ai/src/evaluation/` 拥有 manifest/report/comparator、JSONL、worker executor 和 resumable batch/checkpoint 契约；玩法层只注入 provider、evaluator task 和输出命名。
- Junk canonical fixture 与固定可见状态 snapshot 共用 manifest/runner/report 主链；production-weighted、one-ply-all、two-ply-all 在同一 content hash 下形成三路对照。
- 两个场景 × 三路 evaluator 共六份版本化 baseline；文件名使用 `<scenario-id>.<evaluator>.v<baseline-revision>.baseline.json`，决策和候选集合是回归字段，耗时仅供参考，baseline 不由命令自动创建或覆盖。
- 批量失败通过报告与 hash-safe checkpoint/resume 重跑；不自动 retry 确定性错误，不采集容易误导的跨 worker CPU/resource 汇总。
- generated source 只预留 schema；generator/provider 明确归入路线图步骤 5，不在平台步骤提前定义牌型生成语义。三路 evaluator 若需随无权重结构契约调整，在后续步骤重新评审，不回改 step 0 基线语义。

工具收口检查点：六类 CLI 迁移矩阵和最小 typed command registry 已完成；`evaluate scenario list/run/batch` 已接入；`evaluate policy diff` 已接入无顶层副作用的 handler。最小真实运行同策略 1 seed 共评估 674 个决策点、0 分歧；AI verify 通过（23 files passed、3 skipped；112 tests passed、11 skipped；build 成功）。所有工具迁移完成后，scenario 旧短命令兼容 alias 已删除。

`policy diff` 竖切已完成：通用文本产物层统一 run metadata、JSON 摘要、文本报告和计算前防覆盖；大体量全量记录预留 JSONL，不塞入单个 JSON。真实同策略 1 seed 仍为 674 个决策点、0 分歧；旧 `decision-diff:junk` 双入口已删除。

`weights compare` 迁移完成：同代码权重与跨版本 policy 两条 A/B 路径共用统一产物收尾，`MatchWorkerPool` 和比赛算法未改；两条路径各以同策略 1 seed、单 worker 完成 2 场 smoke，均为 50%/平局并生成 JSON/文本报告。旧 `compare:junk-weights` 双入口已删除。

`weights tune` 迁移完成：统一入口现会在计算前防覆盖，并写入带 run metadata 的 JSON/文本报告；搜索、worker、进度、held-out 门槛和显式 `--write` 权限未改变。注入式测试覆盖默认只读与预检；真实单 worker 最小搜索以 1 generation、1 search seed、1 held-out seed 跑通并生成两份产物。旧 `tune:junk` root alias/entry 已删除。

本检查点 AI fast verify 全绿（26 files passed、3 skipped；119 tests passed、11 skipped；build 成功）。`verify:full` 已完成 typecheck/lint，但 slow test 长时间无输出后人工中止，不能记为通过；本 slice 的真实调参链由上述最小搜索 smoke 覆盖。

`arena run` 迁移完成：统一命令通过结果类型泛型化的 `MatchWorkerPool` 和专用 worker 并行执行现有 `playJunkMatch`，输出每座累计分与名次次数的 JSON/文本报告；报告明确同生产策略自对弈只验证管线并观察座次/牌序偏差，不是策略强弱证据。注入式命令测试及单 worker `1 match × 1 round` 真实 smoke 均通过，默认策略未改变。AI fast verify 全绿（27 files passed、3 skipped；122 tests passed、11 skipped；build 成功）。

`policy capture` 迁移完成：`evaluate policy capture` 保持只复制三项 policy 依赖到 `.compare-scratch/<label>/junk/`、非法 label 拒绝和目标防覆盖边界；filesystem 注入测试取代了会删除整个共享 scratch root 的旧测试清理，避免误碰人工 capture。旧 `capture:junk-policy` root alias/entry 已删除。AI fast verify 全绿（27 files passed、3 skipped；123 tests passed、11 skipped；build 成功）。

统一命令面收尾完成：scenario 旧 `evaluate list/run/batch` 短 alias 已删除，README 和测试只使用 `evaluate scenario ...`；root help 可发现 scenario、policy、weights、arena 全部离线工具。

evaluation 工具物理目录收口完成：`src/junk/` 顶层非测试资产只保留 `strategy.ts`、`tile-probability.ts`、`default-weights.json`；commands、policy source、match/worker 分别迁入 `evaluation/{commands,policy,match}`。新增结构测试锁定顶层生产资产并禁止其反向 import evaluation，公共 barrel 只显式导出 Junk 生产决策 API。统一 help、scenario list 和移动后的 arena worker `1 match × 1 round` smoke 均通过。

命名纠偏完成：`evaluation/cli-entry.ts` 是唯一带顶层 `process.argv`/stdout 副作用的进程入口，`commands/registry.ts` 负责统一分发；其余 handler 按命令职责命名为 `scenario`、`scenario-batch`、`policy-capture`、`policy-diff`、`weights-compare`、`weights-tune`、`arena`，不再用含糊的 `cli.ts` 或重复 `*-cli.ts` 文件名。AI fast verify 全绿（28 files passed、3 skipped；125 tests passed、11 skipped；build 成功），root help、scenario list 与单 worker arena 最小 smoke 通过。

目录收口检查点 AI fast verify 全绿（28 files passed、3 skipped；125 tests passed、11 skipped；build 成功），server typecheck 通过。移动后的定向 slow 验证通过：同代码顺序/worker 等价 1 test（21.16s）、跨 policy worker pool 1 test（21.82s）、decision diff 2 tests（31.36s）。按 2026-08-10 用户明确边界，arena 与 tuning slow 用例全部 skip；arena 分段运行约 90 秒无输出后已中止，不把 `verify:full` 记为通过。真实 `1 match × 1 round` arena smoke 和 `1 generation × 1 search seed × 1 held-out seed` tuning smoke 已分别覆盖两条工具链。

工具命令全部迁移后增加物理目录收尾：`src/junk/` 顶层只保留生产策略及直接依赖，离线 arena/tune/diff/policy/worker/command adapter 迁入 `src/junk/evaluation/`，增加生产路径不得反向 import evaluation 的护栏并显式收窄公共 barrel。`strategy.ts` 内生产评分、已投产 2-ply 与纯诊断 evaluator 的进一步拆分留到路线图步骤 3。

下一步第一个具体动作：为步骤 2 建立临时专门计划，先从现有 canonical fixture 抽取一个只读 `StructuralMetrics` 报告样例，验证字段能否解释候选差异；不修改生产评分、默认权重、候选筛选或 AI 对外行为。

## 专题路线图

每一步开始前，结合当时状态补充该步骤的专门计划；未开始的步骤不提前实现或标记完成。步骤完成后，只在本文件保留结果、证据、限制和对后续步骤有影响的判断。

- 0 已完成：可重复的基线 bench 与验证平台
- 0b 已完成：AI evaluation 工具统一收口
- 1 已完成：AI/Junk 测试盘点与职责重分类
- 2 下一步：只读 StructuralMetrics 诊断契约
- 3 待开始：结构分析、2-ply 与动作评分模块边界
- 4 待开始：人工确认的 canonical fixtures
- 5 待开始：自动牌型生成器与样本报告
- 6 待开始：保守 Pareto 支配诊断/过滤
- 7 待开始：无权重全量 2-ply 三路诊断对照
- 8 待开始：isolationPotential 影响边界校准
- 9 待开始：普通路线的 paired-seed 与 held-out 验证
- 10 后续独立专题候选：番型路线收益模型可行性；不在本专题自动启动

## 阻塞与遗留问题

- 尚无阻塞；若发现需要改变 RuleSet 接口、协议语义或跨层边界，暂停实现并标 TODO 提回架构决策。

## 后续事项

候选专题统一见 [`backlog.md`](backlog.md)，不从候选列表自动选择下一项；由用户明确指定后再建立新的 `plan.md` 当前任务。
