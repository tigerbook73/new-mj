# Junk evaluation scenarios

这是 `@new-mj/ai` 内部的 Junk AI 评估入口。scenario 是纯数据，执行逻辑由
provider、evaluator 和 runner 提供。

## 当前 manifest

`fixtures/canonical-baseline.json` 是当前唯一已接入的 manifest，同时登记手写 fixture
和固定生产 snapshot：

- `purpose: canonical-baseline`：固定普通牌型输入，用于记录生产 AI 的可重复决策；
- `source.kind: fixture`：输入来自版本化 JSON fixture；
- `version`：manifest 和 scenario 的数据版本，不是 evaluator 版本；
- `seed`：仅由 `generated` source 携带并驱动确定性生成；fixture 不使用 seed；
- `description`/`tags`：帮助人和 AI 快速理解场景用途，不参与执行逻辑。

具体输入位于同目录的 `fixtures/*.json`，只包括牌种、牌副本、玩家视角和合法动作；
fixture 身份由 registry 的 `fixtureId` 提供，版本由 manifest 中的 scenario 提供。
provider 会把牌种/牌副本转换为 TileId，并生成 `contentHash`。snapshot 使用
`*.snapshot.json` 保存某个玩家当时可见的完整生产决策边界（自己的手牌、公开牌河、
副露、摸牌上下文和合法动作），不保存隐藏牌墙或其他玩家手牌。

`fixtures/canonical-structural-expectations.json` 独立记录人工确认的候选关系、精确结构
指标和理由；它不进入生产 fixture schema，也不让 `standard-only` 选择动作。加载时会
校验 schema、scenario、比较牌种和重复 ID，`structural-metrics.test.ts` 对真实 evaluator
结果执行这些关系断言。

JSON 只用于 manifest 和少量 canonical fixture。大规模 generated、snapshot 或
replay 数据不直接拼成一个巨大的 JSON 数组；批量 runner 应使用一条记录一行的
JSONL，以便流式读取、按行校验、分片分发和失败场景重跑。JSONL 第一条非空行是
header，后续每行是一个带 `scenarioId` 和数据版本的独立记录，不能依赖跨行状态；文件顺序不作为
决策输入，报告仍按稳定 scenario ID 排序。现有 reader 支持 `.jsonl`；压缩输入尚未接入。

## 使用

```bash
pnpm --filter @new-mj/ai evaluate --help
pnpm --filter @new-mj/ai evaluate scenario list
pnpm --filter @new-mj/ai evaluate scenario run discard-001
pnpm --filter @new-mj/ai evaluate scenario run discard-001 \
  --baseline src/junk/evaluation/fixtures/baselines/discard-001.production-weighted.v1.baseline.json
pnpm --filter @new-mj/ai evaluate scenario generate --seed 20260814 --count 1000 \
  --shard-index 0 --shard-count 4
pnpm --filter @new-mj/ai evaluate scenario validate --development-seed 20260814 \
  --held-out-seed 20260815 --count 100
pnpm --filter @new-mj/ai evaluate scenario teacher-audit --development-seed 20260814 \
  --held-out-seed 20260815 --count 1000
pnpm --filter @new-mj/ai evaluate scenario batch manifest.json snapshots.jsonl \
  --evaluator two-ply-all --workers 4 --chunk-size 64 \
  --checkpoint checkpoint.json --run-id snapshot-batch-001
pnpm --filter @new-mj/ai evaluate policy diff --help
pnpm --filter @new-mj/ai evaluate policy capture --help
pnpm --filter @new-mj/ai evaluate weights compare --help
pnpm --filter @new-mj/ai evaluate weights tune --help
pnpm --filter @new-mj/ai evaluate arena run --help
```

`scenario run` 对同一个规范化输入执行七路 evaluator，并写入同一份 JSON/Markdown 报告：

- `production-weighted`：当前生产混合路径，作为行为基线；
- `standard-only`：全部合法弃牌的只读普通标准型结构指标，不加权、不选动作；
- `one-ply-all`：全部合法动作的一轮生产加权评分，不执行 2-ply/cliff；
- `two-ply-all`：全部合法弃牌进入现有生产加权 continuation，首层/第二次弃牌均不执行
  cliff，并选择加权值最高者；
- `two-ply-structural-all`：全部合法弃牌进入纯标准型结构续行，每个自摸分支报告最低向听
  层的 Pareto 前沿和聚合指标；不把偏序压成分数，因此不选择首层动作。
- `structural-bounded`：未接入默认生产的纯结构弃牌候选；报告一层支配标记、是否进入固定
  五候选搜索预算、2-ply 聚合指标和最终选择，用于与 full teacher 做显式对照。
- `isolation-boundary`：用默认权重和仅关闭 `isolationPotential` 的权重做 one-ply/two-ply
  paired 对照；只在一层及结构 2-ply 指标完全等价的候选组内报告排名影响，不选择动作。

`standard-only@v2` 当前报告弃牌后的普通标准型向听数、理论进张牌种/牌种数，以及按玩家
可见信息估计的存活进张牌种数和剩余进张张数；它不包含七对、番型权重，也不代表墙内
真值、自摸概率、完整胡牌概率或终局 EV。`two-ply-structural-all` 同样不使用生产权重；
其余三路使用当前生产权重。

同一场景内的 Pareto 标注只比较向听数相同的候选，并只使用存活进张牌种数与剩余张数：
两项都不差且至少一项更好才构成严格支配。不同向听、两项完全相同或一项更好另一项更差
都不会产生支配；JSON 候选指标记录同向听层前沿以及支配、被支配、并列和不可比较的候选
ID。该标注只用于离线诊断，不选择动作，也不筛除生产候选。

`scenario generate` 生成确定性的无副露 14 张标准牌型弃牌样本。生成器从完整牌集按 seed
洗牌，不读取 canonical expectation、权重或生产评分；按牌种计数去重后才依据全局稳定序号
做 modulo 分片，因此各 shard 不重叠，合并后等于同 seed/count 的未分片样本。每个 shard
输出内容相同的完整 manifest 副本和一份自包含 JSONL，文件名都带 `part-NNNN`，可独立搬运。
当前生成分布只用于基础牌形覆盖，不代表实战阶段分布；中盘代表性仍由固定 snapshot 提供。

`scenario batch` 当前消费外部 manifest 和自包含 snapshot/generated JSONL。一次 batch 只运行一个 evaluator，
使 checkpoint 明确绑定一种计算语义；需要七路结果时用相同输入分别运行七次。`--workers`
使用已有 worker_threads executor，`--chunk-size` 决定每次交付 checkpoint 的场景数。
`--checkpoint` 在每个 chunk 后写入包含 manifest 版本、evaluator 和已完成 evaluations 的完整
JSON 快照；中断后用 `--resume <checkpoint.json>` 恢复。恢复时 manifest/evaluator/content hash
任一不匹配都会失败，不会静默复用旧结果。replay batch 要等对应 provider 落地。

generated 输入可运行全部七路 evaluator，包括 bounded 结构候选、两个只读结构 evaluator
和 isolation paired 诊断。七路报告应使用相同
manifest/content hash 分别生成；不跨 evaluator 合并分数。Markdown 摘要逐场景记录候选数、
选择、耗时和 cache hit/miss，JSON 保留完整候选指标。

步骤 7 的三路 2-ply 对照特指：`two-ply-all` 的全候选当前加权 leaf、
`two-ply-structural-all` 的全候选纯结构 leaf，以及 `production-weighted` 的当前生产
cliff/fallback/最终选择。纯结构路径在玩家可见信息下仍未知的牌副本之间归一化；其中
`immediateCompletionMass` 只表示下一次自摸直接完成标准型的估计质量，
`conditionalExpectedBestShanten` 只在非立即完成分支上统计第二弃牌可达的最低向听，
都不是整局胡牌概率或终局 EV。

`isolation-boundary@v1` 的结构等价组要求普通向听、存活进张种类/张数，以及结构 2-ply
的进张质量、立即完成质量、条件期望最佳向听和第二弃牌前沿统计完全相同。报告中的
`WithIsolation`/`WithoutIsolation` 只相差 `isolationPotential` 权重；组外排名变化不得归因
为 isolation 边界，组内变化也只说明当前启发式的边际影响，不证明胜率或 EV 改善。

`scenario validate` 固定执行 `paired-standard-heldout-v1`：开发集和留出集由两个不同的
`standard-concealed-v1` 顶层 seed 生成，命令同时校验场景 seed 与内容 hash 不重叠；基线和
候选逐场景共用输入。当前候选参数只允许覆盖 `isolationPotential`，默认以 0 作为关闭该项的
探针。选择若在同向听层被另一候选同时以存活进张种类和张数严格支配，计为结构支配错误；
开发集和留出集都不增加才通过结构门禁。该命令只写 JSON/文本报告，不写默认权重；通过门禁
也不代表胜率或 EV 改善，任何生产采纳仍需独立 A/B 与人工确认。JSON 同时保留所有决策变化
及基线/候选结构支配错误的场景 seed，供相同生成器重建后人工复核。

`scenario teacher-audit` 固定执行 `bounded-structural-teacher-v1`，在互不重叠的开发集和
留出集上逐场景配对 bounded 与 full teacher。JSON 保存动作一致率、全部差异场景 seed、
teacher 相对 bounded 的立即完成/条件期望向听/进张种类与张数差值，以及两路耗时的
P50/P95。首个门槛固定为两组一致率均不低于 `99%`，且 bounded/full 的 P95 比值均不高于
`0.6`；门槛只判断当前 shortlist 近似是否值得继续评估，不证明牌理、胜率或终局 EV，
也不切换生产入口。默认每组 1000 个样本；这是人工慢速 evaluation 命令，不进入 `verify`。

batch 的机制不属于 Junk：`src/evaluation/batch.ts` 定义通用 resumable batch 契约，负责
manifest/JSONL header 校验、checkpoint schema/store、兼容性和恢复编排。这里的 Junk CLI
只是薄 adapter，绑定 snapshot resolver、Junk evaluator worker 和 `junk-` 输出前缀。

当前六份决策 baseline 位于 `fixtures/baselines/*.baseline.json`，覆盖 canonical/snapshot ×
production-weighted/one-ply-all/two-ply-all。它们保存输入内容哈希、评估器版本、
期望动作、候选 ID，并可选择保存候选分数及容差；baseline 文件作为版本化资产，不由运行
结果覆盖。通用 comparator 将结果分类为 matched、changed 或 incompatible，并分别报告
动作、候选集合和分数变化；输入 hash/evaluator 不一致视为 incompatible。耗时只作信息记录。
`scenario run --baseline <file>` 是只读比较入口：matched 返回 0，质量变化返回 2，不兼容或运行错误
返回 1；比较结果写入同一 JSON/Markdown report，命令不会创建或更新 baseline。

文件名固定为 `<scenario-id>.<evaluator>.v<baseline-revision>.baseline.json`；点分段区分
场景、评估器和 baseline 资产修订版。文件内 scenario version、`evaluatorVersion` 与这里的
baseline revision 是三个独立版本维度。

generated source 由 `scenario generate` 与 generated provider 接入；当前版本固定为
`standard-concealed-v1`。批量失败保留在报告/checkpoint 中，通过 hash-safe resume 重跑；
不自动 retry 确定性错误，也不采集容易误导的跨 worker CPU/resource 汇总。

## 来源类型

schema 预留了 `fixture`、`snapshot`、`generated` 和 `replay`。目前已实现
`fixture`、`snapshot` 和 `generated` provider；replay 会明确报告不支持，不会静默转换。

当前 canonical loader 仍显式注册 JSON fixture。新增场景在完善通用 registry 前，
需要同时更新 manifest 和 `canonical-fixtures.ts` 的数据注册；这属于当前实现限制。

registry 已按 `source.fixtureId` 匹配数据，不会把一份 fixture 静默套到 manifest 的
所有 scenario。JSONL reader 的最小格式为：

```json
{"type":"header","schemaVersion":1,"manifestId":"generated","manifestVersion":1,"shardId":"part-0000","shardIndex":0,"shardCount":1}
{"type":"scenario","schemaVersion":1,"scenarioId":"generated-001","data":{}}
```

reader 只负责 header、逐行解析和基础字段校验；具体 `data` 的 schema、TileId 转换和
场景合法性仍由对应 provider 负责。建议文件名为
`<manifest-id>.v<manifest-version>.part-<zero-padded-index>.jsonl`，例如
`junk-generated.v1.part-0000.jsonl`。
