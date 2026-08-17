# Junk evaluation scenarios

这是 `@new-mj/ai` 内部的 Junk AI 评估入口。scenario 是纯数据，执行逻辑由
provider、evaluator 和 runner 提供。

## 当前 manifest

`fixtures/canonical-baseline.json` 是当前接入 runner 的输入 manifest，同时登记手写 fixture
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

`fixtures/structural-baseline-v1.json` 是生产策略的行为 manifest，不是第二套场景输入：它绑定
`structural-baseline@1` 与上述输入 manifest，固定 discard、claim、self-turn/gang 的 canonical
期望动作以及 hu/zimo/draw 流程动作。生产 facade 与完整 core 对局测试都对照同一个版本化 v1
实现；有意改变这些行为时必须建立新版本，不能静默改写 v1。

该版本建立时沿用已经完成的固定环境证据，不把耗时写成跨机器硬断言：bounded/full teacher
在 seed `20260814` 的 1000 个开发场景一致 `1000/1000`，P95 为 `33.85/95.41ms`；seed
`20260815` 的 1000 个留出场景一致 `999/1000`，P95 为 `33.41/94.51ms`。完整策略在 seed
`20260817` 的 50 seeds / 100 场运行中无失败或步数上限，单次结构决策 P95 为 `26.590ms`。
这些数值描述 v1 建立时的边界；后续 candidate 应在同环境重跑并与进入 slice 前的 structural
baseline 比较。

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
pnpm --filter @new-mj/ai evaluate scenario generate --seed 20260814 --count 1000 \
  --shard-index 0 --shard-count 4
pnpm --filter @new-mj/ai evaluate scenario teacher-audit --development-seed 20260814 \
  --held-out-seed 20260815 --count 1000
pnpm --filter @new-mj/ai evaluate scenario batch manifest.json snapshots.jsonl \
  --evaluator structural-bounded --workers 4 --chunk-size 64 \
  --checkpoint checkpoint.json --run-id snapshot-batch-001
pnpm --filter @new-mj/ai evaluate policy diff --help
pnpm --filter @new-mj/ai evaluate policy capture --help
pnpm --filter @new-mj/ai evaluate arena run --help
```

## Baseline/candidate policy 契约

通用 policy source 由 `ref` 或 `modulePath`、可选 `exportName` 组成；默认导出是模块自己的
`chooseJunkAction`，因此当前工作树默认解析为 `structural-baseline@1`。`policy diff` 可用
`--baseline-export`/`--candidate-export` 比较同一模块中的显式策略导出；跨版本 match worker
也携带相同 export 字段。当前树不加载权重资产。

arena 的核心输入始终是四个 `SeatPolicy`，不预设评分范式；`productionPolicy` 只包装当前
结构生产策略。通用 worker pool 位于 `match/worker-pool.ts`，要求调用方提供任务类型、
结果类型和 worker 失败结果。换位对局位于 `match/policy-match.ts`，顺序与 worker 路径调用同一
任务函数；`policy capture` 复制当前 structural 的完整生产闭包，使用 `policy diff` 对照决策。

旧 dynamic cliff、claim hurdle、跨决策 analysis LRU 和有限总体概率函数的可复用性审计已固定
在 `docs/architecture/shanten.md`。结论是保留设计意图和重建场景，不保留其 weighted 载体；
当前 structural 的固定预算、严格结构比较和 teacher audit 已覆盖可复用部分。

`scenario run` 对同一个规范化输入执行五路 structural evaluator，并写入同一份
JSON/Markdown 报告：

- `standard-only`：全部合法弃牌的只读普通标准型结构指标，不加权、不选动作；
- `two-ply-structural-all`：全部合法弃牌进入纯标准型结构续行，每个自摸分支报告最低向听
  层的 Pareto 前沿和聚合指标；不把偏序压成分数，因此不选择首层动作。
- `structural-bounded`：当前生产基线的纯结构弃牌组件；报告一层支配标记、是否进入固定
  五候选搜索预算、2-ply 聚合指标和最终选择，用于与 full teacher 做显式对照。
- `structural-claim`：当前生产基线的 `hu + chi/peng/minGang + pass` 结构组件；报告每个动作
  是否已建模、普通结构指标和 claim 后最佳弃牌。minGang 额外报告至多 34 种可见剩余补牌、
  立即完成质量和非完成分支的条件期望最佳结构；结构打平或没有补牌分支时 pass。
- `structural-turn`：当前生产基线的 `zimo + anGang/buGang + discard` 结构组件；gang 复用
  补牌聚合，并同时对比 bounded 最佳弃牌及各自等价弃牌。纯结构打平时 discard，不为杠本身
  增加固定奖励；报告所有候选是否进入搜索及聚合指标。
  `standard-only@v2` 当前报告弃牌后的普通标准型向听数、理论进张牌种/牌种数，以及按玩家
  可见信息估计的存活进张牌种数和剩余进张张数；它不包含七对、番型权重，也不代表墙内
  真值、自摸概率、完整胡牌概率或终局 EV。全部 evaluator 都不使用可调生产权重。

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
使 checkpoint 明确绑定一种计算语义；需要多路结果时用相同输入分别运行。`--workers`
使用已有 worker_threads executor，`--chunk-size` 决定每次交付 checkpoint 的场景数。
`--checkpoint` 在每个 chunk 后写入包含 manifest 版本、evaluator 和已完成 evaluations 的完整
JSON 快照；中断后用 `--resume <checkpoint.json>` 恢复。恢复时 manifest/evaluator/content hash
任一不匹配都会失败，不会静默复用旧结果。replay batch 要等对应 provider 落地。

generated 输入可运行全部五路 evaluator，包括 bounded/claim/turn 结构候选和两个只读结构
evaluator。各路报告应使用相同
manifest/content hash 分别生成；不跨 evaluator 合并分数。Markdown 摘要逐场景记录候选数、
选择、耗时和 cache hit/miss，JSON 保留完整候选指标。

`two-ply-structural-all` 的纯结构路径在玩家可见信息下仍未知的牌副本之间归一化；其中
`immediateCompletionMass` 只表示下一次自摸直接完成标准型的估计质量，
`conditionalExpectedBestShanten` 只在非立即完成分支上统计第二弃牌可达的最低向听，
都不是整局胡牌概率或终局 EV。

`scenario teacher-audit` 固定执行 `bounded-structural-teacher-v1`，在互不重叠的开发集和
留出集上逐场景配对 bounded 与 full teacher。JSON 保存动作一致率、全部差异场景 seed、
teacher 相对 bounded 的立即完成/条件期望向听/进张种类与张数差值，以及两路耗时的
P50/P95。首个门槛固定为两组一致率均不低于 `99%`，且 bounded/full 的 P95 比值均不高于
`0.6`；门槛只判断当前 shortlist 近似是否值得继续评估，不证明牌理、胜率或终局 EV，
也不切换生产入口。默认每组 1000 个样本；这是人工慢速 evaluation 命令，不进入 `verify`。

batch 的机制不属于 Junk：`src/evaluation/batch.ts` 定义通用 resumable batch 契约，负责
manifest/JSONL header 校验、checkpoint schema/store、兼容性和恢复编排。这里的 Junk CLI
只是薄 adapter，绑定 snapshot resolver、Junk evaluator worker 和 `junk-` 输出前缀。

结构生产行为由 `fixtures/structural-baseline-v1.json` 固定。通用 comparator 和
`scenario run --baseline <file>` 仍可对未来 baseline/candidate 资产做只读比较；命令不会创建
或更新 baseline。

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
