# 待完成任务与当前状态

> 本文件只记录当前工作、阻塞/遗留问题、下一步和 Backlog；专题完成后的耐久结论归档到对应架构/契约文档。

## 当前任务

当前专题：关闭 Junk AI 决策质量优化分支，并准备人工合并到 `main`。

当前收尾动作：处理两份 code review 的合并前问题，并完成受限环境外的最终 verify。

当前实现目标：

- 默认 Junk AI 使用两轮快速过滤的 2-ply；
- 首轮上断崖：`minN=2`、`maxN=4`、阈值 20%；
- 第二轮下断崖：`minN=1`、`maxN=all`、阈值 20%；
- 2-ply 结构计算统一使用 core `evaluateUkeireAfterDiscardDraws`；
- 当前基础权重保持不变；后续参数调优另开分支处理。

## 已完成并保留

- 概率评分、墙牌比例模型、既有副露 ukeire 修复和结构分析缓存；
- core suit table / shanten prober 优化及完整测试；
- core 两变化结构 batch API；完整 2-ply 端到端约减少 11% 耗时，决策结果与旧路径一致；
- 两轮断崖 2-ply 候选方案，固定上下阈值 20%；
- 通用 arena、权重 A/B、调参和代码版本对比工具；
- 正式策略所需的回归 fixture 和测试。

## 本轮清理范围

删除未采用路线的过程实现和专用材料：

- 固定 Top-N、结构 Top-4、最低向听黑名单等实验代码；
- 共享缓存、摸牌状态重叠、full-result batch 等实验代码；
- two-ply benchmark、baseline、对抗性搜索、结构化 runner 及其 CLI、worker、测试和数据；
- 对应 package/root 脚本和失效文档引用。

保留后续参数和代码 A/B 所需的 arena、tune、compare-weights、decision-diff、policy-loader、snapshot 及其测试。

## 收尾步骤

1. [x] 完成正式 2-ply + core batch 的生产路径重构。
2. [x] 完成未采用实验代码、数据、CLI 和文档引用清理。
3. [x] 既有正式路径回归测试通过：非弃牌动作、胜牌、声明、缓存和温度采样均有覆盖。
4. [x] 完成 AI/core 类型检查、lint、测试和构建；验证结果见下文。
5. [x] 将保留内容、删除内容、限制和验证结果写回本文件。
6. [x] 提交当前分支的最终整理提交（`10bc8c3`），确认工作区干净。
7. [x] 综合两份 review，修复合并前问题并补充回归测试。
8. [ ] 在非受限环境执行最终 AI/core verify，随后停在人工合并前：不切换 `main`、不执行 merge/squash merge、不推送、不删除当前分支。

## 验收标准

- 默认 Junk AI 确实走两轮 2-ply；
- 默认 2-ply 路径使用 core batch；直接 probe 调用保留兼容性 fallback；
- 未采用实验材料已清理；
- 后续参数 A/B 工具仍可运行；
- `pnpm --filter @new-mj/ai verify:full` 通过；
- `pnpm --filter @new-mj/core verify:full` 通过；
- `git diff --check` 通过且工作区干净；
- 输出人工合并命令和注意事项，但不执行最终合并。

## 本轮验证记录

- AI typecheck：通过。
- AI lint：通过。
- AI strategy 定向测试：32/32 通过。
- AI build：通过。
- AI 全量测试：业务测试通过；`policy-loader.test.ts` 的 2 个测试在受限环境中因 `spawnSync git EPERM` 失败，随后测试进程未正常退出，未将该环境问题伪装成全绿。
- `policy-loader.test.ts` 历史版本 fixture 曾错误指向已完成概率改造的 `6f2a7d8`，改为其父提交 `6f2a7d8^` 后，非受限环境定向测试 6/6 通过。
- core `verify:full`：19 个测试文件、192 个测试通过，构建通过。
- `git diff --check`：通过。
- review follow-up 定向测试：AI 39/39、core shanten 15/15 通过；AI/core typecheck 与 lint 通过。
- 受限环境下 policy loader 的 git ref 测试仍会报 `spawnSync git EPERM`，需在非受限环境完成最终 verify。
- 下一步第一个具体动作：在非受限环境执行 `pnpm --filter @new-mj/ai verify:full`，确认最终收尾验证。

## 阻塞与遗留问题

- 分支关闭后，基础权重和断崖参数需要另开独立计划；
- 2-ply 仍是启发式评估，不是完整牌局价值证明。
- 2-ply 终局收益模型、断崖窗口 batch 合并、strategy.ts 拆分和断崖参数调优留待独立 benchmark/计划。

## Backlog

### 独立专题：普通胡牌基础牌形校准

本专题必须在当前 `junk-ai-strategy-optimization` 收尾并完成人工合并边界后另开分支；不与当前正式 2-ply、默认权重和人工合并动作混做。第一阶段只研究普通标准牌型路线，不引入清一色、混一色、七对、碰碰胡或防守目标的联合调优。诊断模式明确使用 `standard-only`；生产模式保持当前固定规则和评分行为不变。

目标：把基础牌形的结构判断从统一加法分数中分离出来，自动发现明显牌理错误；保留当前 2-ply 作为未来牌形评价器，不把它误称为完整胡牌概率或终局 EV。

计划步骤：

0. [ ] 先建立可重复的基线 bench 与验证平台：固定一组 canonical fixtures、自动生成样本种子和代表性实战 snapshot，分别记录当前生产版权重筛选、无权重全量候选和现有 2-ply 的候选数、决策结果、运行时间、缓存命中和报告版本；增加指标计算、候选比较、决策差异和报告格式的最小测试。大样本扫描和全量 2-ply 只通过独立 CLI/slow 用例手动运行，不进入普通 `pnpm verify`。该平台只服务本专题，先不改变生产策略，也不把随机自对弈结果当作基础牌形真值。
1. [ ] 盘点现有 AI/Junk 测试并重分类：区分结构契约、策略回归、2-ply 正确性、arena/worker、policy loader 和调参平台；基础牌形期望迁移到 `structural-calibration.test.ts`，依赖当前权重的具体选牌保留为 policy regression。回放/协议 E2E 优先使用确定性 core action log；确需 bot 推进时使用显式 `twoPly: false` 的快速测试策略，并保留少量默认 `twoPly: true` 的 server AI 冒烟测试。该开关默认不改变生产行为。先迁移和标记，不直接删除；只有新诊断覆盖后才删除重复用例。
2. [ ] 定义只读 `StructuralMetrics` 诊断契约：以不同弃牌种类为候选单位，使用 `standard-only` 且脱离所有 `JunkWeights` 计算弃牌后的向听数、进张种类、有效牌数和改善概率；改善概率必须显式记录 `wallCount`、`unseenPoolSize`、公开牌河、公开副露和摸牌 horizon（至少区分早/中/晚牌山），并标注这是玩家视角估计而非完整胡牌概率。同时记录候选是否被当前生产版权重预筛选选中，并输出支配/非支配/并列分类。该诊断只生成报告，不参与生产选择。
3. [ ] 在不改变行为和对外导出的前提下做渐进式模块拆分：将 `StructuralMetrics`/手牌结构分析、2-ply、动作评分分别建立清晰边界；`strategy.ts` 暂时保留 façade，现有生产调用、缓存生命周期和结果保持等价。先拆纯函数和类型，不同时重写评分公式或调参算法。
4. [ ] 增加少量人工确认的 canonical fixtures（约 20–40 个，覆盖孤张/字牌、两面/嵌张/边张、对子/刻子拆解、低向听窄牌与高向听宽牌、早中晚牌山）；用户只需确认样例意图，不逐局标注。
5. [ ] 增加自动牌型生成器：从合法 14 张牌生成结构变体，枚举所有弃牌；对 1,000–10,000 个样本输出结构指标和分类，不把非支配冲突强行标成唯一正确答案。
6. [ ] 实现保守 Pareto 支配诊断/过滤：只有向听、进张种类、有效牌数、改善概率均不差且至少一项严格更好时才删除候选；向听与宽度冲突时保留到下一层，不先写死“向听差 1/2”的门槛。
7. [ ] 建立两种无权重预筛选的全量 2-ply 诊断对照：枚举所有不同弃牌种类，使用现有 core batch，不经过当前第一轮权重排序和断崖筛选；分别输出“当前权重叶子评分”和“standard-only 纯结构叶子评分”。同时保留生产版“权重筛选 + 2-ply”作为第三个对照，记录候选漏选数、决策差异、结构指标和耗时。该诊断先不改变生产行为。
8. [ ] 将 `isolationPotential` 从普通 `handQuality` 主分数降为极弱 tie-break，或暂时关闭；用 canonical fixtures 验证它不能跨越明确的结构优势，只能解决基础指标并列。
9. [ ] 只在结构校准通过后，用 arena 的 paired-seed、held-out seeds 和 `decision-diff` 验证普通路线；先限制调参范围到 `shantenWeight`、`tenpaiProbabilityWeight` 及 tie-break，不自动写入默认配置。
10. [ ] 若后续要接入番型路线，另开专题设计路线可行性和收益模型；不把无法可靠计算的真实胡牌概率伪装成当前校准器标签。

阶段验收：

- 诊断能解释每个候选的结构指标、支配关系和最终 tie-break 原因；
- 现有测试已完成职责分类；迁移后的结构测试与策略回归测试均有明确命名和入口，未覆盖前不删除原回归用例；
- 回放/协议测试不再以完整生产 AI 2-ply 作为唯一建局手段；快速策略和默认 2-ply 至少各有一条明确的集成覆盖，生产默认仍为 `twoPly: true`；
- 模块拆分前后生产决策、对外 API、缓存生命周期和基线耗时无未解释变化；未完成等价验证前不进入评分或默认策略改动；
- canonical fixtures 通过，自动样本只把明确支配关系作为硬结论；
- 非支配冲突不会被任意权重或 `isolationPotential` 静默覆盖；
- 2-ply 候选数和热路径耗时有基线对比，未验证的优化不进入默认策略；
- 诊断报告能区分“生产权重预筛选影响”“当前权重叶子评分影响”和“纯结构叶子评价”，并明确概率上下文与不确定性；
- 只有在全量诊断可重复、canonical fixtures 无回归、Pareto 过滤无误删、决策差异可解释且性能达到基线门槛后，才提交是否替换生产筛选的人工决策；否则保留诊断版，不改默认路径；
- AI 定向测试、类型检查、lint、构建和决策差异检查通过；若修改 core，再执行 core 完整验证和至少 1000 局 fuzz；
- 完成后才另行评估默认权重变更，并在 `plan.md` 记录采用/拒绝及证据。

- Mobile 横屏/竖屏布局与 Expo 路线；
- Junk Table UX：Replay、慢网络反馈、声明超时行为及 E2E；
- 评估 `immer` 替代 ruleset 手写 `cloneState`，先验证 fuzz 性能；
- 下次改动杭州/垃圾胡 view 时评估提取共享 PlayerView 回放逻辑；
- 下次改动结算 Overlay 时评估提取共享 `RoundEndOverlayShell`。
