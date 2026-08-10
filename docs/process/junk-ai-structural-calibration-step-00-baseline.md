# 普通胡牌基础牌形校准：step 0

状态：当前步骤，平台设计完成；已完成工具边界盘点、source provider 契约、最小 report 契约、真实 fixture/生产 evaluator adapter、单场景 report runner 和 AI 包内 CLI 入口，下一步是 canonical baseline 登记/比较。本文件只描述平台计划，不记录过程日记。

## 目标与非目标

建立一个可复用的结构校准与性能评估平台，使新增测试场景只需提供场景数据和评估配置，不需要修改 bench 框架、报告格式或 worker 调度代码。平台同时服务：

- 生产版权重筛选；
- 无权重全量候选；
- `standard-only` 结构评价；
- 现有 2-ply 及后续结构评估器；
- canonical fixture、固定 snapshot、批量样本和性能基线。

本步骤不改变生产策略、默认权重、`twoPly: true` 行为或 AI 对外 API；不把随机自对弈胜率当作普通牌理真值。

现有 bench/CLI 的文件名和函数名不是设计约束。为形成清晰的平台职责，可以重命名、拆分、合并或移动 `arena`、`decision-diff`、`snapshot`、`tune`、worker 及其测试；只有已经被外部使用的稳定命令或对外 API 需要提供迁移说明，必要时再保留短期兼容入口。

## Top-down 设计

### 1. 先定义稳定的平台契约

以“场景输入 → 评估器集合 → 统一结果 → 报告/基线产物”为唯一主链，场景和评估器通过注册/配置接入，不在测试文件里拼接临时 bench 逻辑。

场景 provider 解析后的标准输入至少包含：

- 可重放的场景 ID、来源和版本；
- 手牌、公开牌河、副露、摸牌上下文和必要的牌山信息；
- 评估模式、候选范围、随机种子和 horizon；
- 期望用途：契约回归、决策差异、性能基线或探索性扫描。

评估器输出统一为结构化结果，至少包含候选列表、选中决策、结构指标、运行计时、缓存命中、错误/跳过原因和 evaluator version。生产版权重筛选与诊断评价必须能在同一输入上并列运行。

Provider 分层固定为：`ScenarioProvider`（fixture/snapshot/generated/replay）、`EvaluatorProvider`（生产权重/`standard-only`/2-ply/decision diff）和统一 `Executor`（单线程/有界 worker）；baseline/候选差异使用纯 `Comparator`，JSON/Markdown 使用 `ReportWriter`。性能采集作为横切 wrapper，不为每类测试复制 runner。

step 0 先适配现有 `JunkPlayerView + legalActions` 的生产 evaluator；step 2 再决定是否引入更底层的结构诊断输入，避免基线平台提前锁死 `StructuralMetrics` 契约。

### 2. 用数据驱动测试，保证复用和开发效率

- canonical fixture、snapshot、批量种子和报告配置使用统一 manifest；
- canonical scenario 本身只保存可读、可版本化的纯数据；当前 TypeScript fixture registry 只是 bootstrap，step 0 完成前必须迁移为 manifest/fixture 数据文件；
- manifest/少量 canonical fixture 使用 JSON；大规模 generated、snapshot、replay 数据使用 JSONL 流式记录，避免单个 JSON 数组的内存和解析成本；JSONL 记录必须自包含，支持分片、失败重跑和稳定聚合，后续可增加 gzip reader；
- 测试只选择 manifest、评估器和断言级别，不修改平台代码；
- 断言分层为：结构字段/不变量、候选集合、决策差异、性能阈值和报告 schema；
- 新增评估器只需实现稳定 adapter，并复用通用 runner、比较器、序列化器和 reporter；
- fixture 既可被单测快速运行，也可被 CLI/批量任务直接复用，避免测试输入和 bench 输入分叉；
- 测试失败必须带场景 ID、seed、评估器版本和报告路径，能够直接重跑单个场景。

### 3. 设计可控的多任务/多 worker 执行模型

大量场景默认采用任务清单 + 有界 worker pool，而不是让每个测试自行创建并发。执行模型需要支持：

- 按场景或 seed 分片，任务可独立重试和断点续跑；
- Node `worker_threads` 或等价多进程 worker 承载 CPU 密集的 shanten/2-ply 计算；
- 主进程负责任务分发、进度、聚合和报告写入，worker 不直接竞争同一报告文件；
- 并发度、批大小、warmup、超时和缓存策略由 manifest/CLI 统一配置，并有安全默认值；
- 小型 fixture 测试支持单线程确定性模式，大样本 bench 使用多 worker 模式；
- 记录 wall time、CPU time、worker 数、任务吞吐、p50/p95 延迟、失败/重试数和缓存命中，避免只看总耗时；
- 并发结果按稳定场景顺序聚合，不能因任务完成顺序改变报告或决策结果。

先测量单线程基线，再引入 worker；并行加速必须与单线程结果做等价比较，不能用并行吞掉不稳定或非确定性。

### 4. 固定报告契约，避免临时处理参数和格式

报告分为机器产物和人读摘要，两者使用同一个 versioned schema：

- `run`: run ID、git SHA、package/version、配置哈希、平台、时间和命令；
- `input`: manifest、fixture/snapshot、seed、场景数量和上下文版本；
- `evaluation`: evaluator、参数、候选数、决策、指标和决策差异；
- `performance`: wall/CPU time、吞吐、分位延迟、worker、缓存和资源摘要；
- `quality`: 失败、跳过、重试、非确定性或 schema 不兼容信息；
- `baseline`: 对比的 baseline ID、差异阈值、回归分类和结论。

固定生成 JSON/JSONL 原始结果、Markdown 摘要和可选 CSV/表格导出；CLI 只选择场景、评估器、输出目录和 baseline，不临时拼接报告字段。报告 schema、排序、数值精度和 diff 规则要有单测。

### 5. 把 baseline 当作受控资产保存

baseline 不是一次运行的日志，而是可引用、可比较的版本化资产。每个 baseline 至少保留：

- canonical fixture/manifest 版本、固定 seeds 和 evaluator/config 版本；
- 三种候选路径的候选数、决策、结构结果和关键性能指标；
- 运行环境、git SHA、core/AI package 版本、worker 配置和缓存模式；
- 人工确认的结论、已知限制、允许波动范围和是否可作为后续门槛；
- 原始报告位置或内容哈希，确保摘要不会脱离原始数据。

小规模 canonical baseline 和关键决策 diff 纳入版本控制；大规模原始报告按仓库约定保存或外置，但必须保留 manifest、摘要、哈希和恢复说明。禁止用“最新一次运行”覆盖历史 baseline。

### 6. 提供人和 AI 都能快速使用的入口

平台需要有一条最短成功路径和一条批量路径，并在 `--help`/专题 README 中明确：

- 如何列出可用 scenario/evaluator；
- 如何只跑一个 fixture、一个 seed 或一个 evaluator；
- 如何跑固定 baseline、并行批量和单线程复现；
- 如何指定/创建/比较 baseline；
- 报告写在哪里，如何从报告定位失败场景并重跑；
- 哪些任务是普通测试、slow bench、性能门禁或人工分析。

命令参数采用稳定命名和配置文件优先，避免每次评估临时记忆参数组合。当前包内入口为 `pnpm --filter @new-mj/ai evaluate list` 或 `evaluate run <scenario-id>`；AI 使用时应能从 manifest、schema 和示例报告直接判断输入、输出和限制；人使用时应能从一条命令定位到可读摘要。

### 7. 增加可观测性和失败恢复

- 每个任务都有稳定 ID，日志与报告使用同一 ID；
- 单场景失败不丢失其他任务结果，批量结束时明确成功/失败/跳过；
- 支持从 manifest + run ID 重跑失败任务，不重复计算已完成且校验通过的任务；
- schema、配置或 git 版本不兼容时快速失败并给出迁移/重建提示；
- 性能回归与结构决策回归分开分类，避免一个阈值掩盖另一个问题。

## 交付边界

本步骤只交付平台设计和最小可行验证，不提前实现后续 `StructuralMetrics`、Pareto 过滤或权重调整。实现时建议按以下顺序推进：

1. 先固化 manifest、统一结果模型、报告 schema 和 baseline ID；
2. 用一个 canonical fixture、一个 snapshot 和三种现有评估路径跑通单线程端到端链路；
3. 用同一输入接入通用断言、决策 diff 和报告测试；
4. 再增加有界 worker pool，与单线程结果和性能基线对照；
5. 最后补 CLI 使用说明、失败重跑和 baseline 比较入口。

任何实现若需要修改 core RuleSet 接口、协议语义或生产策略，停止本步骤并提回架构决策；不为 bench 方便绕过现有分层。

## 验收标准

- 新增一个场景或评估器不需要修改通用 runner、worker 调度和报告 schema；
- canonical scenario 不包含执行逻辑；新增数据场景不需要修改 provider 代码，provider 只负责通用校验、TileId 转换、视图/合法动作构造和 content hash；
- 平台重构后的命名和目录能反映职责；旧名称没有因为历史包袱继续承载混合职责，外部入口的迁移路径清楚；
- 单个 fixture、固定 snapshot、批量 seeds 和三种现有评估路径共享同一 manifest/结果模型；
- 单线程和多 worker 结果等价，任务顺序不会影响决策或报告；
- 批量运行有有界并发、稳定聚合、失败重试/重跑和性能分位数据；
- 大数据输入不要求一次性加载到内存，JSONL reader 能按记录流式校验并交给统一 provider/executor；
- 人读摘要与机器报告字段固定，报告能直接定位失败场景和复现命令；
- baseline 具备版本、环境、配置、哈希、结论和限制，不覆盖历史数据；
- 普通测试、slow bench、性能门禁和人工报告有明确入口与边界；
- 最小端到端验证不改变生产策略，且不把大样本/全量 2-ply 纳入普通 `pnpm verify`。

## 最早验证与下一动作

最早验证不是跑大样本，而是写出一个最小 manifest、一个统一报告样例和一条单场景复现命令，确认三种现有评估路径能在不改 bench 框架的情况下产出同构结果。

已完成：canonical manifest 与 fixture 已迁移为版本化 JSON；provider 从数据重建真实 `JunkPlayerView` 与合法动作，执行通用校验、TileId 转换并生成稳定 `contentHash`。报告 evaluation 已记录该哈希，新增数据场景无需修改 provider/runner。

补充完成：manifest/scene 增加用途、描述和 tags 元数据，calibration README 说明当前 manifest、字段、命令和 source 支持边界；已明确当前 loader 仍有显式 fixture 注册限制。

当前单场景 baseline 已登记在 `packages/ai/src/junk/calibration/fixtures/baselines/`；它固定输入哈希、evaluator 版本、期望动作和候选数，不把耗时作为硬门槛，也不允许运行结果覆盖该资产。

下一动作：设计不依赖逐个 import 的通用 fixture registry，并明确 JSONL reader 的记录 schema、分片和稳定聚合边界；先不实现大批量 worker pool。
