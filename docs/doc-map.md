# doc-map：文档归属与生命周期

> 本文件规定“什么内容放哪里、何时清理”。它是稳定索引，不记录文档体系的迁移历史。

## 目录结构

```
overview.md                     入口·一页纸
architecture/                   系统原理、边界与长期设计
contracts/                      跨 package 的当前契约
variants/                       每个玩法自己的规则与私有契约
testing-strategy.md             测试策略
process/plan.md                 当前任务计划、步骤状态与关键完成结论
process/backlog.md              用户待选择的候选专题
process/workflow.md             工作流与 DoD
```

## 内容归属

| 内容                                       | 主场                               | 生命周期                   |
| ------------------------------------------ | ---------------------------------- | -------------------------- |
| 项目目的、当前能力、阅读路径               | `overview.md`                      | 活文档，里程碑更新         |
| 系统原理、数据模型、长期设计取舍           | `architecture/*.md`                | 活文档，设计变化时更新     |
| engine、协议、会话的行为与不变量           | `contracts/*.md`                   | 活文档，与代码同 commit    |
| 玩法规则、私有状态/事件/配置               | `variants/<id>.md`                 | 活文档，与代码同 commit    |
| 公共/玩法私有的判定与转正记录              | `architecture/variant-boundary.md` | 仅边界变化或新增玩法时更新 |
| 测试层次、文件位置、最低门槛               | `testing-strategy.md`              | 策略变化时更新             |
| AI 不可违反规则与包级边界                  | 根/包级 `AGENTS.md`                | 活文档，保持短小           |
| DoD、依赖、Git、专题流程                   | `process/workflow.md`              | 活文档                     |
| 当前专题、步骤状态、关键完成结论与遗留问题 | `process/plan.md`                  | 当前任务文档，持续清理     |
| 尚未选择的候选专题与选择规则               | `process/backlog.md`               | 用户选择后移入当前任务     |

`CLAUDE.md` 仅为兼容性入口，指向同目录 `AGENTS.md`；规范的唯一内容主场是 `AGENTS.md`。

## 阅读路径

- 新人：`overview.md` → `architecture/system.md` → `architecture/key-designs.md`。
- 改玩法：`architecture/variant-boundary.md` → `contracts/engine-contract.md` → 最接近的 `variants/*.md` → `testing-strategy.md`。
- AI 会话：从当前目录向上读 `AGENTS.md` → `process/plan.md` → 按需读契约/玩法/`workflow.md`。

## 分流规则

- 类型/schema 已有权威代码时，文档指向代码并保留叙事、理由、不变量与时序；未实现内容保留完整规格。
- 跨端契约或长期解释价值 → `contracts/` 或 `architecture/`；玩法私有 → `variants/`；局部实现陷阱 → 代码注释或 package `AGENTS.md`。
- 专题推演只留在 `plan.md`，或当前步骤的临时一页 `process/<topic>.md`。步骤完成后将影响后续判断的价值内容归并到 `plan.md`，删除临时文档；整个专题完成后再按 workflow 将耐久结论分流，清除专题状态。
- 文档按主题命名，不按阶段号/日期命名。想新增抽象或把玩法逻辑提到公共层时，先查 `variant-boundary.md`；不确定则保守地留在玩法内。

## `AGENTS.md` 与 workflow 的边界

- 违反即错误的铁律、护栏、范围边界 → `AGENTS.md`。
- 怎么做的命令、阈值与步骤 → `process/workflow.md`。
- 两处允许互相链接，但不重复完整规则；重复视为文档 bug。

## 专题收尾清单

1. 耐久结论归入 architecture/contracts/variants，局部原因留代码注释。
2. 清除 `plan.md` 中已完成专题的状态，更新当前工作与下一步；仍未解决的问题转入遗留问题或 Backlog。
3. 删除临时 brief，清理过程标记和过期路径。
4. 走查 docs 与代码是否一致；新增玩法或边界变化时复审 `variant-boundary.md`。
