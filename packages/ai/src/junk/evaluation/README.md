# Junk evaluation scenarios

这是 `@new-mj/ai` 内部的 Junk AI 评估入口。scenario 是纯数据，执行逻辑由
provider、evaluator 和 runner 提供。

## 当前 manifest

`fixtures/canonical-baseline.json` 是当前唯一已接入的
manifest：

- `purpose: canonical-baseline`：固定普通牌型输入，用于记录生产 AI 的可重复决策；
- `source.kind: fixture`：输入来自版本化 JSON fixture；
- `version`：manifest 和 scenario 的数据版本，不是 evaluator 版本；
- `seed`：仅由 `generated` source 携带并驱动确定性生成；fixture 不使用 seed；
- `description`/`tags`：帮助人和 AI 快速理解场景用途，不参与执行逻辑。

具体输入位于同目录的 `fixtures/*.json`，只包括牌种、牌副本、玩家视角和合法动作；
fixture 身份由 registry 的 `fixtureId` 提供，版本由 manifest 中的 scenario 提供。
provider 会把牌种转换为 TileId，并生成 `contentHash`。

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
```

`run` 当前只执行生产权重 evaluator，输出选中的动作和统一 JSON/Markdown 报告；
它还不是完整的结构指标或 baseline 比较工具。

当前决策 baseline 位于 `fixtures/baselines/*.baseline.json`。它保存输入内容哈希、评估器版本、
期望动作和候选数量；baseline 文件作为版本化资产，不由运行结果覆盖。当前只有
决策和候选数量是可比较结果，耗时只作信息记录。

## 来源类型

schema 预留了 `fixture`、`snapshot`、`generated` 和 `replay`。目前只有
`fixture` provider 已实现，其他类型会明确报告不支持，不会静默当作 fixture。

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
接入 `worker_threads` 后才会获得真正的多核收益。

reader 只负责逐行解析和基础字段校验；具体 `data` 的 schema、TileId 转换和场景
合法性仍由对应 provider 负责。
