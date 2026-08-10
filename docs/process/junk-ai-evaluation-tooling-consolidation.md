# Junk AI evaluation 工具统一收口

状态：当前纠偏步骤。步骤 1 测试职责重分类暂停在已验证检查点；本步骤完成后恢复其 full 验证与文档收尾。

## 背景与目标

步骤 0 建立了 `packages/ai/src/evaluation/` 的 scenario、executor、report、baseline 和 resumable batch 契约，但未把既有 `arena`、`tune`、`compare-weights`、`decision-diff`、`policy-loader/capture` 纳入同一工具体系，形成新旧两套 CLI、worker 和报告入口。这不符合原先“统一评估平台”的目标。

本步骤把离线 AI 工具收口为一个 package 内 `evaluate` 命令族：通用层拥有命令路由、run envelope、执行/产物契约；Junk 层保留算法、policy 来源和玩法 adapter。不是把所有业务结果强压成同一种 payload，也不改变策略、权重或评估算法。

## 目标结构与命令

```text
packages/ai/src/evaluation/
  commands/       命令注册、解析、help、退出码
  executor/       顺序、worker、batch（沿用现有实现）
  artifacts/      report、baseline、checkpoint（沿用现有实现）
  scenario/       manifest、JSONL、provider（沿用现有实现）

packages/ai/src/junk/evaluation/
  commands/       Junk 命令 adapter
  policy/         policy source/capture adapter
  providers/      fixture/snapshot/generated/replay adapter
  evaluators/     production/one-ply/two-ply adapter
```

目标入口：

```text
evaluate scenario list|run|batch
evaluate policy diff|capture
evaluate weights compare|tune
evaluate arena run
```

`evaluate` 继续属于 `@new-mj/ai` package；root 不保留快捷脚本。命令采用名词 + 动词，不引入 CAC/Commander，先以小型 typed registry 满足当前规模。

## 统一边界

通用 command contract 至少定义：

- 稳定 command path、usage/help、参数解析结果和退出码；
- 可注入 runtime，使测试不触发顶层 fs/process/git 副作用；
- run ID、命令、git SHA、开始时间、输出目录和不覆盖规则；
- JSON/Markdown 产物接口，以及工具专属 payload/summary adapter；
- 顺序/worker executor 选择、进度和失败分类的复用入口。

Junk adapter 负责：

- `JunkPlayerView`、policy/weights 来源和 evaluator 选择；
- arena/tuning/decision-diff 的领域参数与结果 payload；
- 哪些命令只读、哪些命令允许显式写入。`weights tune --write` 仍是唯一显式写默认权重的路径，并保留 held-out 门槛。

不强制统一：

- scenario report、arena 排名、decision diff、tuning search history 的业务字段；
- 自对弈任务与 scenario evaluation task 的输入形状；
- 大规模人工评估与普通 verify 的运行规模。

## 执行顺序

### 迁移矩阵

| 命令族                    | 当前入口/任务模型                              | 并发                           | 产物与写权限                        | 收口方式                                             |
| ------------------------- | ---------------------------------------------- | ------------------------------ | ----------------------------------- | ---------------------------------------------------- |
| `scenario list/run/batch` | package `evaluate`；fixture/snapshot evaluator | batch 使用通用 worker executor | JSON/Markdown、checkpoint；不覆盖   | 只迁移路由，沿用 runner/report/batch                 |
| `policy diff`             | root script；同局面决策分歧抽样                | 当前顺序执行                   | 文本报告；只读                      | 首个完整竖切，接 policy source 与统一 run envelope   |
| `weights compare`         | root script；完整对局 A/B                      | `MatchWorkerPool`              | 文本报告；只读                      | 保留 match task，迁移参数、进度与产物生命周期        |
| `weights tune`            | root script；(1+1)-ES 搜索                     | `MatchWorkerPool`              | 报告；仅显式 `--write` 可写默认权重 | 保留搜索和 held-out 门槛，只统一外壳                 |
| `policy capture`          | root script；复制三项 policy 依赖              | 无                             | gitignored scratch；有界写入        | 迁移为 policy adapter，不纳入通用只读报告            |
| `arena run`               | 尚无独立 CLI；完整自对弈 driver                | 可复用 match worker            | 排名/对局摘要；只读                 | 新增薄 adapter，不把 arena task 改造成 scenario task |

结论：通用契约只统一命令发现/分发、退出码、run metadata、进度和产物生命周期；scenario evaluator、match task、调参搜索继续是不同的 typed payload/handler。worker 复用执行协议，不强求共用一种任务数据结构。

### 1. 建立最小 typed command registry

- 从现有 `evaluate` 提取无玩法假设的 command path、help 和 dispatch 契约；
- 保留 CLI entry 与算法/handler 分离；
- 先注册现有 scenario `list/run/batch`，验证新路由不改变报告与退出码。

已完成：六类工具盘点和迁移矩阵；通用 registry 只定义 command path、summary/help、异步 handler 与退出结果；scenario 三个命令已接入 `evaluate scenario list/run/batch`，旧短命令暂作隐藏兼容别名。通用 registry 单测、实际 help/list、AI verify 均通过。

### 2. 迁移 decision-diff 竖切

- 注册 `evaluate policy diff`，复用 policy-loader、arena driver 和现有 slow smoke；
- 使用统一 run/output envelope，但保留 decision-diff 专属报告字段；
- 与现有 `decision-diff:junk` 做参数、结果和失败行为等价测试；通过后删除旧 entry/root script。

已完成：`evaluate policy diff` 已注册为无顶层副作用的 handler；通用文本产物层统一 run ID、command、Git SHA、开始时间、JSON 摘要、文本报告和防覆盖，并在昂贵计算前预检输出。JSON 只保留策略来源、seed、决策点和分歧计数；限定样例留在文本中，未来全量分歧使用 JSONL。命令专属 help、注入式等价测试和真实 self-play 均通过（同策略、1 seed：674 个决策点、0 分歧）；旧 `decision-diff:junk` entry/root script 已删除。

这个竖切同时覆盖 policy source、完整引擎、slow 工具和只读报告，是验证统一结构是否足够的最小代表。

### 3. 按职责迁移其余命令

1. `weights compare`：复用 policy source 与 match executor；只读。
2. `weights tune`：复用搜索算法；默认只读，显式 `--write` 维持现有门槛。
3. `arena run`：复用 self-play driver 和 worker。
4. `policy capture`：复用已收窄的三个 policy 依赖；仅写 gitignored scratch。
5. scenario `list/run/batch`：完成兼容 alias 清理，固定最终 help。

工具命令全部迁移后，再做一次物理目录收口：`src/junk/` 顶层只保留生产策略及其直接依赖，arena/tune/diff/policy/worker/command adapter 迁入 `src/junk/evaluation/` 的职责子目录。随后增加生产路径不得 import `junk/evaluation/**` 的依赖护栏，并把公共 barrel 改为显式生产 API。`strategy.ts` 内部的生产评分、已投产 2-ply 与纯诊断 evaluator 拆分留到专题步骤 3，避免与本步骤的 CLI 生命周期迁移混做。

每迁移一项，先加新入口等价测试，再删除对应旧 CLI/entry/root script；不同时重写算法。

`weights compare` 已完成：`evaluate weights compare` 注册为无顶层副作用的 handler；同代码权重 A/B 和跨版本 policy A/B 共用 `MatchupResult` 产物收尾，保留 `MatchWorkerPool`、双向同牌序、参数语义和只读边界。两条路径各以同策略 1 seed、单 worker 完成 smoke，均为 2 场、50%/平局并生成 JSON/文本报告；旧 `compare:junk-weights` entry/root script 已删除。

`weights tune` 已完成：无顶层副作用的 handler 接入统一 run metadata、计算前防覆盖和 JSON/文本报告；调参搜索、worker pool、进度输出、held-out 门槛与显式 `--write` 权限保持不变。单测覆盖默认只读产物和预检，真实单 worker 最小搜索完成 1 generation、1 search seed、1 held-out seed 并生成两份产物；旧 `tune:junk` root alias/entry 已删除。

`arena run` 已完成：`MatchWorkerPool` 将结果类型泛型化但保留现有 A/B 默认结果，arena adapter 复用 `playJunkMatch` 并通过专用 worker 并行独立 session；报告汇总每座总分与四档名次，并明确同策略 arena 只验证管线/观察座次牌序偏差，不作为策略强弱证据。注入式测试与单 worker `1 match × 1 round` 真实 smoke 均通过，生成 JSON/文本产物。

### 4. 收尾与恢复步骤 1

- 更新 `packages/ai/AGENTS.md` 与 evaluation README 的统一入口和扩展方式；
- 审计旧 `*-cli.ts`、entry 和 root scripts 已无引用；
- 运行 AI `verify`/`verify:full`，确认 fast/slow 工具管线；
- 将耐久结论归并到 `plan.md`，删除本计划；恢复步骤 1，只做其剩余 full 验证与收尾，不重做已完成盘点。

## 验收标准

- 人和 AI 只需从 `evaluate --help` 即可发现全部离线 AI 工具；
- 新命令采用统一 command registry、run metadata、输出/防覆盖和错误格式；
- scenario、policy diff、weights compare/tune、arena、capture 各有明确 handler/adapter，不复制顶层参数框架；
- 旧 root 快捷脚本和独立 CLI entry 在等价迁移后删除，无双入口漂移；
- 各工具原有算法、seed、worker 等价、只读/写入护栏和 slow 边界保持不变；
- 不改变 production Junk AI 决策或默认权重；
- AI `verify` 和 `verify:full` 全绿并报告实际结果。

## 已知风险与确认边界

- 统一的是生命周期和扩展接口，不是把不同业务报告扁平化；若 run envelope 无法无损承载某工具，扩展 typed payload，不复制第二套框架。
- policy-loader 目前只支持 AI-only 跨版本比较，不支持 core 同时跨版本；本步骤保持限制。
- `capture:junk-policy`、tune `--write` 会写本地文件，但权限边界不扩大；其余命令保持只读。
- 若迁移需要改变策略算法、RuleSet/协议或默认权重，停止并另提决策，不借工具重构实施。
