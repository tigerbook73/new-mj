# Junk calibration scenarios

这是 `@new-mj/ai` 内部的 Junk AI 评估入口。scenario 是纯数据，执行逻辑由
provider、evaluator 和 runner 提供。

## 当前 manifest

`fixtures/junk-structural-calibration-canonical.json` 是当前唯一已接入的
manifest：

- `purpose: canonical-baseline`：固定普通牌型输入，用于记录生产 AI 的可重复决策；
- `source.kind: fixture`：输入来自版本化 JSON fixture；
- `version`：manifest 和 scenario 的数据版本，不是 evaluator 版本；
- `seed`：场景来源的稳定标识。fixture 当前不通过随机生成使用它；
- `description`/`tags`：帮助人和 AI 快速理解场景用途，不参与执行逻辑。

具体输入位于同目录的 `fixtures/*.json`，包括牌种、牌副本、玩家视角和合法动作。
provider 会把牌种转换为 TileId，并生成 `contentHash`。

JSON 只用于 manifest 和少量 canonical fixture。大规模 generated、snapshot 或
replay 数据不直接拼成一个巨大的 JSON 数组；批量 runner 应使用一条记录一行的
JSONL，以便流式读取、按行校验、分片分发和失败场景重跑。JSONL 每行必须是一个
带 `scenario` 元数据和数据版本的独立记录，不能依赖跨行状态；文件顺序不作为
决策输入，报告仍按稳定 scenario ID 排序。后续可在不改变 evaluator 契约的前提下
增加 `.jsonl`/`.jsonl.gz` reader。

## 使用

```bash
pnpm --filter @new-mj/ai evaluate list
pnpm --filter @new-mj/ai evaluate run canonical-production-selection-001
```

`run` 当前只执行生产权重 evaluator，输出选中的动作和统一 JSON/Markdown 报告；
它还不是完整的结构指标或 baseline 比较工具。

当前决策 baseline 位于 `fixtures/baselines/`。它保存输入内容哈希、评估器版本、
期望动作和候选数量；baseline 文件作为版本化资产，不由运行结果覆盖。当前只有
决策和候选数量是可比较结果，耗时只作信息记录。

## 来源类型

schema 预留了 `fixture`、`snapshot`、`generated` 和 `replay`。目前只有
`fixture` provider 已实现，其他类型会明确报告不支持，不会静默当作 fixture。

当前 canonical loader 仍显式注册 JSON fixture。新增场景在完善通用 registry 前，
需要同时更新 manifest 和 `canonical-fixtures.ts` 的数据注册；这属于当前实现限制。
