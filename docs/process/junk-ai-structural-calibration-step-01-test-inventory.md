# 普通胡牌基础牌形校准：步骤 1 测试盘点与职责重分类

状态：当前步骤，仅制定并执行测试盘点/重分类计划；不进入 `StructuralMetrics` 或生产策略修改。

## 目标与交付边界

建立一份覆盖 `packages/ai` 现有测试的职责地图，使后续结构诊断、canonical fixture 和性能验证能放到明确层级，不继续把结构契约、生产行为回归、bench 管线冒烟和慢速完整对局混在同一测试文件中。

本步骤交付：

- 逐文件、必要时逐 describe/case 的测试清单与当前责任；
- 目标归属、测试层级、运行频率和保留理由；
- 重复覆盖、缺口、错误位置/slow 标记和命名问题；
- 对结论明确且不损失覆盖的移动、拆分或标签修正；
- 对存在语义取舍的项目给出建议与备选，待用户确认后再改。

本步骤不改变评分公式、默认权重、候选筛选、2-ply 行为、core API 或 AI 对外行为；不提前定义无权重结构指标，也不因为测试难整理而删除回归覆盖。

## 分类契约

每项测试同时标记四个维度：

1. **责任域**：通用 evaluation 契约、Junk provider/evaluator、Junk 策略纯函数、生产决策回归、工具/CLI、self-play/tuning/worker 集成。
2. **测试层级**：贴近实现的 unit、数据驱动 fixture/回归、跨模块 contract/integration、完整引擎/跨进程、slow bench smoke。
3. **运行频率**：普通 `test`、`test:full` slow、仅人工运行的有意义大规模评估；人工 bench 不伪装成自动测试。
4. **断言价值**：算法不变量、生产行为基线、序列化/schema、执行等价、失败护栏、性能信息或仅管线连通。

目标位置遵循 `docs/testing-strategy.md`：真正贴近实现的测试留在 `src/`；跨模块、完整引擎、worker/self-play 集成放 `test/`。通用 evaluation 测试不能因当前只有 Junk consumer 就长期由 Junk runner 测试代管。

## 执行计划

### 1. 建立可核对的现状清单

- 枚举全部测试文件、describe/case 数、slow 标签、直接依赖和主要被测入口；
- 记录快速/完整测试实际运行边界，识别未标 slow 的秒级计算或被误标 slow 的纯函数；
- 先按文件分类；仅对混合职责文件下钻到 describe/case，不制作事无巨细的测试过程日志。

首个具体动作：生成 20 个现有测试文件的责任矩阵，优先审计 `strategy.test.ts`、`junk-weight-tuning.test.ts`、`evaluation/runner.test.ts` 与 `policy-loader.test.ts` 的混合边界。

### 2. 形成目标责任矩阵

对每个文件/混合分组给出 `keep`、`move`、`split`、`merge`、`retire` 或 `add-gap` 结论，并说明：

- 唯一应负责的行为；
- 应位于 `src/` 还是 `test/`；
- 是否进入普通 verify；
- 与 canonical baseline/evaluation framework 是否重复；
- 若删除或合并，哪一条等价或更强断言接替覆盖。

优先处理已知混合点：

- `strategy.test.ts` 同时包含 2-ply probe、生产选择回归、概率上下文、strength config 和权重覆盖；
- `junk-weight-tuning.test.ts` 同时包含快速报告格式和 slow 搜索/worker 集成；
- `junk/evaluation/runner.test.ts` 同时验证通用 runner/JSONL/executor 与 Junk adapter；
- `policy-loader.test.ts` 包含纯校验和依赖 Git/scratch 文件系统的集成路径；
- evaluation baseline 测试与旧 strategy fixture 的职责是否重叠。

### 3. 分批实施低风险重分类

- 先移动/拆分快速纯测试与跨模块测试，使位置和 slow 边界符合既有策略；
- 保持测试名称、输入与断言语义，移动时不顺带重写算法或“优化”fixture；
- 通用契约测试下沉到 `src/evaluation/`，Junk adapter 测试只验证玩法转换和真实 evaluator 接线；
- 对重复但不完全等价、历史回归意图不清或可能削弱 A/B 证据的测试，暂停并给用户提供保留/合并备选，不自行删除。

每个可独立审查的重分类切片均运行受影响定向测试；步骤收尾运行 `pnpm --filter @new-mj/ai verify`。若仅移动测试但暴露既有不稳定性，单独记录原因，不借重分类修改生产行为。

### 4. 归并耐久结论并收尾

- 将影响后续步骤的测试责任、缺口和明确限制压缩归并到 `plan.md`；
- 若测试分层规则具有包级长期价值，更新 `packages/ai/AGENTS.md` 或 `docs/testing-strategy.md`，不把文件清单永久复制到架构文档；
- 删除本临时计划；不自动开始步骤 2。

## 验收标准

- `packages/ai` 每个现有测试文件和混合分组都有唯一主要责任、层级和运行频率；
- 通用 evaluation 契约与 Junk adapter/策略回归边界清楚，不由同一测试重复承担主责任；
- 普通测试与 slow/full 测试符合耗时和依赖边界，完整对局/worker/Git 集成不会伪装成纯单元测试；
- 任何移动、拆分、合并或删除都有覆盖映射，生产行为和 baseline 资产不变；
- 后续步骤 2–9 的新增测试有明确落点，已知缺口进入对应步骤而非在本步骤提前实现；
- AI package typecheck、lint、快速测试和 build 全绿，并报告实际结果。

## 已知未知项与确认点

- `strategy.test.ts` 的历史 fixture 中可能有兼具结构真值与生产权重回归的案例；在逐例读懂前不决定拆分方式。
- evaluation runner 的部分测试可通用化，但真实 worker task 仍需要 Junk adapter；应按断言责任拆分，而不是整文件机械移动。
- Git 历史加载测试曾出现 scratch 临时文件偶发失败；先确认责任层级和复现条件，不在本步骤无证据修改 loader。
- 若发现某项“重复测试”实际承担独立 A/B 证据，默认保留，并向用户说明合并的收益与风险。
