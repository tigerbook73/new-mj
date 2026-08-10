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

JSON 只用于 manifest 和少量 canonical fixture。大规模 generated、snapshot 或
replay 数据不直接拼成一个巨大的 JSON 数组；批量 runner 应使用一条记录一行的
JSONL，以便流式读取、按行校验、分片分发和失败场景重跑。JSONL 第一条非空行是
header，后续每行是一个带 `scenarioId` 和数据版本的独立记录，不能依赖跨行状态；文件顺序不作为
决策输入，报告仍按稳定 scenario ID 排序。后续可在不改变 evaluator 契约的前提下
增加 `.jsonl`/`.jsonl.gz` reader。

## 使用

```bash
pnpm --filter @new-mj/ai evaluate list
pnpm --filter @new-mj/ai evaluate run discard-001
pnpm --filter @new-mj/ai evaluate run discard-001 \
  --baseline src/junk/evaluation/fixtures/baselines/discard-001-production-v1.baseline.json
pnpm --filter @new-mj/ai evaluate batch manifest.json snapshots.jsonl \
  --evaluator two-ply-all --workers 4 --chunk-size 64 \
  --checkpoint checkpoint.json --run-id snapshot-batch-001
```

`run` 对同一个规范化输入执行三路 evaluator，并写入同一份 JSON/Markdown 报告：

- `production-weighted`：当前生产混合路径，作为行为基线；
- `one-ply-all`：全部合法动作的一轮生产加权评分，不执行 2-ply/cliff；
- `two-ply-all`：全部合法弃牌的现有 2-ply 续行计算，不执行 cliff，属于较慢的诊断路径。

这三路仍使用当前生产权重，不代表无权重结构指标；后者属于后续 `StructuralMetrics`
步骤。当前命令还不是 baseline 比较工具。

`batch` 当前消费外部 manifest 和自包含 snapshot JSONL。一次 batch 只运行一个 evaluator，
使 checkpoint 明确绑定一种计算语义；需要三路结果时用相同输入分别运行三次。`--workers`
使用已有 worker_threads executor，`--chunk-size` 决定每次交付 checkpoint 的场景数。
`--checkpoint` 在每个 chunk 后写入包含 manifest 版本、evaluator 和已完成 evaluations 的完整
JSON 快照；中断后用 `--resume <checkpoint.json>` 恢复。恢复时 manifest/evaluator/content hash
任一不匹配都会失败，不会静默复用旧结果。generated/replay batch 要等对应 provider 落地。

batch 的机制不属于 Junk：`src/evaluation/batch.ts` 定义通用 resumable batch 契约，负责
manifest/JSONL header 校验、checkpoint schema/store、兼容性和恢复编排。这里的 Junk CLI
只是薄 adapter，绑定 snapshot resolver、Junk evaluator worker 和 `junk-` 输出前缀。

当前决策 baseline 位于 `fixtures/baselines/*.baseline.json`。它保存输入内容哈希、评估器版本、
期望动作、候选 ID，并可选择保存候选分数及容差；baseline 文件作为版本化资产，不由运行
结果覆盖。通用 comparator 将结果分类为 matched、changed 或 incompatible，并分别报告
动作、候选集合和分数变化；输入 hash/evaluator 不一致视为 incompatible。耗时只作信息记录。
`run --baseline <file>` 是只读比较入口：matched 返回 0，质量变化返回 2，不兼容或运行错误
返回 1；比较结果写入同一 JSON/Markdown report，命令不会创建或更新 baseline。

## 来源类型

schema 预留了 `fixture`、`snapshot`、`generated` 和 `replay`。目前已实现
`fixture` 和 `snapshot` provider；generated/replay 会明确报告不支持，不会静默转换。

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

顺序批量 runner 会流式消费这些 records，按 `scenarioId` 查找 manifest，交给 resolver
构造 normalized scenario，再交给统一 evaluator；输入不会整体加载，重复或不存在的
scenario 会失败。报告额外记录场景数、成功/失败/跳过数量、总耗时、吞吐、p50/p95
延迟和失败摘要。runner 当前只保证顺序消费和稳定报告排序，尚未接入 worker、重试或进度恢复。

executor 的 task 契约使用稳定 `taskId` 和纯 task function；顺序/有界并发模式共用
同一函数，并按输入顺序返回结果。当前有界并发只是 executor seam，CPU 密集任务要
接入 `worker_threads` 后才会获得真正的多核收益。通用 worker adapter 已提供，要求
task input 可结构化克隆、通过 module URL 和 export name 定位纯 task function；CLI
默认仍使用顺序模式。

worker batch 按 `chunkSize` 分块执行，不一次性保留全部 normalized tasks。调用方可用
`onProgress` 显示进度，并通过 `onCheckpoint` 持久化每个新完成 chunk；恢复时传入
`resumeEvaluations`，runner 会校验 scenario content hash，不接受过期结果。

reader 只负责逐行解析和基础字段校验；具体 `data` 的 schema、TileId 转换和场景
合法性仍由对应 provider 负责。
