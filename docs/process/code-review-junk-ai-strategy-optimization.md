# Code Review：junk-ai-strategy-optimization 分支

审查范围：本分支相对 `main` 的全部变更（cloud 多 agent 深度审查，8 个 finder + 独立验证）。

## 需要优先处理

### 1. 摸完最后一张牌时，2-ply 评分会把候选分数错误清零

`packages/ai/src/junk/strategy.ts:536`

`probeSelfDrawTwoPly` 在 `wallCount <= 0` 时返回全零的 probe（`continuationValue=0`、`winProbability=0`）。但 `scoreTwoPlyDiscards`（`strategy.ts:885`）会无条件用这个结果覆盖掉断崖筛选出的头部候选（`ranked.slice(0, upperLimit)`）的分数，而断崖窗口外的候选仍保留一轮评分中真实的 `handQuality` 分数。

牌墙摸到最后一张时（`core/src/rulesets/junk/view.ts` 中 `wallCount` 归零，游戏在下一次摸牌时才结束，见 `state-machine.ts:244`），玩家仍需正常打牌。此时最优的几个候选会被强行拉到接近 0 分，而本来更差的候选反而保留了正常分数，导致 `scoreLegalActions`/argmax 在这个安全性最关键的回合选出更差的牌。

建议：`wallCount <= 0` 时不要覆盖已有的一轮评分，直接回退到一轮结果，而不是写入全零。

### 2. 2-ply 分数与 1-ply 分数在同一个 argmax 里，量纲不可比

`packages/ai/src/junk/strategy.ts:1002`

`scoreTwoPlyDiscards` 只对断崖筛出的 2-4 个候选重新打分（`continuationValue + winProbability`），其余候选和所有吃/碰声明仍走 `scoreAction` 的一轮 `handQuality` 分数。实测对一手真实的 1 向听牌，2-ply 路径比 1-ply 对同一张牌的评分高 +3 到 +13 ——因为 `continuationValue` 是深层搜索的期望值，量级通常在几十到几百，而 `winProbability` 是未缩放的 0~1 值直接相加（`strategy.ts:885`），实质上被 `continuationValue` 淹没，"下一步就能自摸"这个信号几乎不起作用。

吃/碰的 hurdle 判定（`scoreAction` 中 `bestDiscardScore(...) - hurdle`，约 `strategy.ts:899-903`）是按 1-ply 分数量级校准的常量，却要跟可能带 2-ply 偏差的弃牌分数比较，导致 `recommendJunkAction` 系统性地偏向/偏离某一类动作，而不是基于真实价值。

建议：合并前二选一 —— 引入统一量纲的终局收益模型，或者暂时只把 `winProbability` 作为诊断数据、不进入生产评分（这一条此前 codex review 已提出，本次审查从另一角度独立确认了同一问题，建议一并解决）。

### 3. 剩余活牌数没有扣除其他家的副露，导致 2-ply 胜率高估

`packages/ai/src/junk/strategy.ts:297`

`remainingLiveCopies`/`LiveCopyContext` 只扣除**本家**的副露（`meldCounts`，`strategy.ts:548`），不扣除其他家的吃/碰暴露出的牌。例如对手碰了 5m（3 张：1 张来自牌河墓碑、2 张来自对手原本的暗牌），本家视角只能通过墓碑扣掉 1 张，另外 2 张不会被计入，导致 `remainingLiveCopies` 高估 5m 的剩余数量，进而让 `probeSelfDrawTwoPly`（`strategy.ts:567`）高估相关走向的 `winProbability`/`continuationValue`。

这个限制此前只影响暗杠/补杠判断（文档注释里已提到），但本分支新增的 `probeSelfDrawTwoPly` 把它提升成了主评分路径的直接输入，影响范围扩大了。

建议：修正 `LiveCopyContext` 以扣除所有家的公开副露，或者至少在文档/注释中明确这是已知偏差、评估影响范围。

## 测试与工具问题

### 4. `snapshot-junk-cli.ts` 的顶层副作用没有和可测试逻辑拆分

`packages/ai/src/junk/snapshot-junk-cli.ts:51`

`packages/ai/AGENTS.md` 明确要求 CLI 入口要和算法文件拆开，"避免测试文件 import 算法时意外触发脚本副作用"；同一次 diff 里 `decision-diff.ts`/`decision-diff-cli.ts` 正确遵循了这个拆分，但 `snapshot-junk-cli.ts` 没有。实测运行 `vitest run src/junk/snapshot-junk-cli.test.ts` 时，测试输出里混入了 `INVALID_LABEL` / `Usage: ...` 这样的 CLI 输出，因为顶层 `runSnapshotJunkCli(process.argv.slice(2))`（line 51）在 import 时就执行了。

建议：把 `runSnapshotJunkCli` 的调用移到独立的 cli 入口文件，测试只 import 纯函数部分。

### 5. `isValidLabel` 允许纯点号，可能让快照写出沙箱目录

`packages/ai/src/junk/snapshot-junk-cli.ts:22`

正则 `/^[a-zA-Z0-9._-]+$/` 只挡 `/`，不挡纯 `..`。执行 `pnpm snapshot:junk-ai ..` 时，`path.join(packageRoot, ".compare-scratch", "..", "junk")` 会折叠成 `packages/ai/junk`，跑到 `.compare-scratch/` 沙箱之外（该目录的注释明确要求"必须留在 src/ 之外"，避免被 tsconfig/eslint 扫到）。现有测试只覆盖了含 `/` 的 `"../escape"`，没覆盖纯 `".."` 这种情况。

建议：正则改为拒绝纯 `.`/`..`，或在 join 后校验 resolved 路径确实落在 `.compare-scratch/` 内。

### 6. policy-loader 的"历史版本"测试前提在本分支内已经失真

`packages/ai/src/junk/policy-loader.test.ts:72`

测试名为"通过 git ref（HEAD，Phase-1 之前的 improvementWeight）加载历史版本"，但 `improvementWeight → tenpaiProbabilityWeight` 的重命名提交本身就在同一分支更早的位置。分支合并后，`loadPolicy({ ref: "HEAD" }, "head")` 得到的内容会和当前工作区完全一致，不再是真正的历史版本对比。测试断言只检查 `modulePath !== currentStrategyPath` 和 policy 可调用，从未检查权重字段本身，所以测试仍然"通过"，但已经不再测试它名字所声称的东西——会误导之后用 `--baseline-ref HEAD` 做真实历史 A/B 对比的人。

建议：改用一个确实早于本分支、权重结构不同的 ref 作为 baseline，或者在断言里直接检查权重字段差异。

## 重复与可维护性

### 7. `compare-weights-cli.ts` 重复实现了 `policy-loader.ts` 已有的权重文件加载逻辑

`packages/ai/src/junk/compare-weights-cli.ts:107`

`loadWeights` 和本分支新增的 `loadWeightsFile`（`policy-loader.ts`）做的是同一件事：解析 JSON、校验非空对象、比对 key 集合，逻辑几乎一致。`compare-weights-cli.ts` 已经在同一 diff 里 import 了 `policy-loader.ts` 的 `PolicySource`/`resolveModulePath`，却没有复用 `loadWeightsFile`。后续如果要改校验逻辑（比如更清晰的报错信息），容易漏改一处。

建议：`compare-weights-cli.ts` 改为直接调用 `loadWeightsFile`，删除自己的 `loadWeights`。

## 性能（暂不建议凭直觉改，先 benchmark）

### 8. `probeSelfDrawTwoPly` 每个候选都重建一次 DP，没有复用批量接口

`packages/ai/src/junk/strategy.ts:872`

`scoreTwoPlyDiscards` 对断崖筛出的每个候选（2-4 个）分别调用 `probeSelfDrawTwoPly`，每次都会在 `evaluateUkeireAfterDiscardDraws` 内部重新构建 `createTwoChangeShantenProber`（`core/src/lib/shanten.ts`），重复做一次完整的四花色前缀/后缀 DP 初始化。自对弈调参场景下（数千局 × ~18 回合 × 4 家），这个开销会被断崖宽度放大 2-4 倍。`evaluateUkeireAfterDiscardDraws` 本身已经支持批量 discard-kind 索引，可以把整个断崖窗口合并成一次调用来摊销 DP 初始化成本。

### 9. 断崖筛选阈值写死在代码里，脱离本分支新建的 A/B 调参体系

`packages/ai/src/junk/strategy.ts:728`

`DEFAULT_TWO_PLY_CLIFF_CONFIG`（`minN`/`maxN`/`relativeGap`）决定了哪些候选能拿到精确的 2-ply 评估，重要性不亚于任何一个可调权重，但它不在 `JunkWeights` 里，`tune.ts`（(1+1)-ES 搜索）和 `compare-weights-cli.ts` 都碰不到它——要改只能改代码重新部署。`docs/process/plan.md` 收尾记录里已经承认这是有意延后的决定；这里只是标记一下：调参框架已经就位，但这块参数结构上够不到它，后续独立计划里应该一并考虑。

## 文档一致性

### 10. `ukeire` 导出函数的 JSDoc 在重构中丢失

`packages/core/src/lib/shanten.ts:255`

按全局约定"公共函数和类使用 JSDoc"，本分支重构后，公共导出 `export const ukeire = (...)` 不再有文档注释，注释被搬到了新增的内部（未导出）辅助函数 `evaluateUkeireInternal` 上。同一 diff 新增的另外两个公共导出 `evaluateUkeire`（line 271）、`evaluateUkeireBatch`（line 282）都保留了 JSDoc，`ukeire` 成了唯一的例外，容易让后续读者对这三个相关公共 API 的关系产生误解。

建议：给 `ukeire` 补回 JSDoc，说明它与 `evaluateUkeire`/`evaluateUkeireBatch` 的关系（如是否为兼容层/单张查询封装）。

## 处理优先级建议

1. 先定下 1-ply/2-ply 分数量纲统一方案（#2），这是策略语义问题，和 codex 此前的 review 指向同一根因；
2. 修 #1（摸完最后一张牌分数清零）——安全性相关，且改动小；
3. 修 #3（活牌数未扣其他家副露）或至少书面记录已知偏差；
4. 处理测试/工具类问题（#4、#5、#6），保证 CI 结果可信；
5. 其余（#7 重复代码、#8/#9 性能与调参可达性、#10 文档）可在后续迭代中处理，不阻塞合并判断，但建议在关闭本分支前至少过一遍决策记录。

## 关联

- 本报告独立于 `docs/process/review-comments-from-codex.md`（codex 此前对同一分支的审查），二者对"1-ply/2-ply 量纲不一致"这一问题结论一致，可交叉印证。

## 处理结论（2026-08-10）

已修复并验证：

- 牌墙耗尽或 2-ply 没有可评估分支时，候选回退到一轮评分，不再写入全零分数。
- 未建模的即时自摸收益不再以原始 `winProbability` 混入生产分数；该字段保留作诊断结果，含即时自摸分支的候选回退到一轮评分。
- 活牌统计现在扣除本家手牌/副露、所有公开对手副露和牌河；暗杠对其他座位仍按 PlayerView 的隐藏语义不泄漏牌面。
- `snapshot-junk-cli` 已拆出无副作用的纯函数模块和 CLI entry，并拒绝 `.`/`..` label；补充了路径安全回归测试。
- 历史 policy loader 测试改用确实保留 `improvementWeight` 的 `6f2a7d8`，并断言历史权重字段形状。
- `compare-weights-cli` 复用 `policy-loader.loadWeightsFile`；core `ukeire` 公共 JSDoc 已补回。
- `policy-loader` 权重覆盖测试改为断言评分增量，不再把自定义权重和最终 2-ply argmax 动作强绑定。
- `createTwoChangeShantenProber` 新增 1000 组随机删牌/加牌等价性测试，覆盖七对、已有副露和不同牌种路径。

暂不在本轮扩大范围：

- 2-ply 仍是启发式期望值，尚未引入完整终局收益模型；声明动作与 2-ply 弃牌的跨时点比较仍需独立评分模型计划。
- 断崖窗口的多候选 batch 合并、`strategy.ts` 模块拆分和断崖参数调优先保留为后续 benchmark/独立计划，不凭直觉改动。
