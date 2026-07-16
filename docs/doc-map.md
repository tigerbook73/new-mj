# doc-map：本项目的文档结构与维护规则

> 元文档：规定每类内容的归属、生命周期与清理时机。本文件本身极少变更。
> **v2（本次重构）**：阶段 2 完成、阶段 3 未开始之际，把原先按"层"（类型/协议/房间）与按"玩法"混用的扁平文档，改成"公共契约按层、玩法专属按玩法聚合"的目录结构，并新增 `architecture/variant-boundary.md`（公共/私有边界台账）与 `testing-strategy.md`（测试策略先定后做）。原始文档整体移入 `_legacy/` 存档过渡；新结构稳定、内容确认已被活文档完整承接后，`_legacy/` 已整体删除（历史表述与迁移前版本见 git 历史）。

## 1. 目录结构

```
overview.md                     入口·一页纸
architecture/
  system.md                     部署视图、包拓扑、工程结构
  data-model.md                 核心数据模型（概念级）
  key-designs.md                跨玩法设计模式叙事
  variant-boundary.md           公共/玩法专属边界判定准则 + 台账
contracts/
  engine-contract.md            core 引擎公共契约
  protocol-shared.md            通用协议契约
  session-mechanics.md          房间/会话容器骨架
variants/
  junk.md                       垃圾胡（规则+专属类型+专属协议+跨局规则一体）
  bloodbattle.md                血战到底（同上）
  <新玩法>.md                    日麻等后续玩法，立项时创建
testing-strategy.md             测试策略
process/
  plan.md                       阶段路线与状态（过程性）
  workflow.md                   流程细则（过程性）
decisions.md                    决策记录（append-only，记录级；例外见 §2.2）
```

## 2. 文档清单与分类

| 生命周期              | 文档                                                                                                                         | 读者                      | 维护方式                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 产品级·活文档         | `overview.md`                                                                                                                | 新人优先                  | 里程碑更新                                                                                                                     |
| 产品级·活文档         | `architecture/system.md`、`architecture/data-model.md`、`architecture/key-designs.md`                                        | 新人优先                  | 里程碑更新；只写原理与入口，不复制契约细节                                                                                     |
| 产品级·活文档（新增） | `architecture/variant-boundary.md`                                                                                           | 人 + AI，尤其加新玩法的人 | 每次新增玩法或边界判定变化时更新，见 §3.1                                                                                      |
| 产品级·活文档         | `contracts/engine-contract.md`、`contracts/protocol-shared.md`、`contracts/session-mechanics.md`（规格四件套的公共契约部分） | 人 + AI                   | **与代码同 commit** 更新；始终只描述当前状态；类型贴代码 vs 指向代码见 §4                                                      |
| 产品级·活文档         | `variants/*.md`（规格四件套的玩法专属部分，每玩法一份）                                                                      | 人 + AI                   | 同上                                                                                                                           |
| 产品级·活文档（新增） | `testing-strategy.md`                                                                                                        | 人 + AI                   | 边界变化或新增玩法门槛调整时更新                                                                                               |
| 产品级·活文档         | 根目录及各 package 的 `CLAUDE.md`/`AGENTS.md`（分层 AI 会话规范）                                                            | AI / 协作者               | 每次开工必读；只放不容妥协的规则 + 索引指针，具体步骤不展开；根目录只放全局规则，package 目录放局部规则；CLAUDE.md 预算 100 行 |
| 产品级·活文档         | `process/workflow.md`（流程细则）                                                                                            | AI / 协作者               | 按需查阅，不要求每次开工通读；放 DoD/依赖维护/测试工具/Git 等展开的操作步骤；与 `AGENTS.md` 的分工见 §2.3                      |
| 记录级                | `decisions.md`                                                                                                               | 人 + AI                   | 默认 **append-only**，只增不改；精简例外见 §2.2                                                                                |
| 过程性                | `process/plan.md` 的阶段状态与待办区；Claude Project 讨论；规格中的评审标注                                                  | 推进用                    | 阶段收尾清理；耐久内容先吸纳再删                                                                                               |

### 2.1 边界台账的特殊维护方式

`architecture/variant-boundary.md` 不同于普通"活文档"——它的表格本身就是需要持续 append 的记录（类似 `decisions.md` 但只针对"公共/私有边界"这一件事）：新增玩法、机制转正、边界判定变化都要回写，不能等阶段收尾才补。

### 2.2 decisions.md 的精简例外

默认规则不变：`decisions.md` 是唯一记录"为什么"的地方，活文档（`architecture/*.md`/`contracts/*.md`）按 §4 规则只写结论、指针指回这里，因此绝大多数条目**不应删除**——删了指针就指向空气。

允许删除/精简某条目，仅当**同时满足**：

1. 该决策的完整推理（不只是结论）已经逐字或近似逐字固化进某篇活文档，活文档不再需要指回本文件补充"为什么"；
2. 全仓库没有其他文档单靠条目编号（如 `D3`、评审点 `H`）来引用这条决策的独有推理。

操作方式：不删除编号本身（编号不复用，避免误导"决策不存在过"），原文替换为一行"已并入 `<path>`，原文见 git 历史"的指针；同一 commit 内把所有引用该编号的文档改为直接指向新的落脚文档，不再经过 `decisions.md` 转一手。

### 2.3 `AGENTS.md` 与 `process/workflow.md` 的分工

两者都指导 AI 会话，容易写重——已经因此清理过一次整段重复的内容，边界现在显式化：

- **`AGENTS.md`**（根目录及 package 级）：每次开工必读的"宪法"。只放不容妥协的东西——项目身份、当前阶段、架构铁律、护栏、指向其他文档的 Ground Truth 索引；具体怎么做不在这里展开，甩指针给别处（多数指向 `workflow.md`）。
- **`process/workflow.md`**：按需查阅的"操作手册"。放 DoD 的具体命令清单、依赖维护步骤、测试工具选择、Git 分支约定这类展开的流程细节；不要求每次开工都通读。

判断新内容该写进哪份的经验法则：**这条规则一旦违反是否直接构成错误（铁律/护栏级）** → `AGENTS.md`；**这条规则是"怎么做"的具体步骤/命令/阈值** → `workflow.md`。两份文件之间允许互相指（`AGENTS.md` 的 DoD 一句话指向 `workflow.md` 的完整清单，`workflow.md` 的会话仪式指回 `AGENTS.md` 的基本动作），但**不重复对方已经写过的内容**——发现同一条规则在两处都有完整表述，视为文档 bug，合并到该条规则的主场，另一处只留指针。

## 3. 阅读路径

见 `overview.md` 的阅读地图（按读者类型分流）；本节只强调 AI 会话的开工顺序：从当前目录向上读取根级规则，再读取最近的 package 级 `CLAUDE.md`/`AGENTS.md` → `process/plan.md` 状态区（开工）→ 按需读 `contracts/*.md`/`variants/*.md` 与 `process/workflow.md`。

## 4. 规格文档：类型贴代码 vs 指向代码（不变）

一旦某个类型/schema 在代码里有了权威实现（`packages/core`、`packages/protocol`、或消费方 `apps/server`），文档里不再重复贴完整代码块，改成"见 `<file>`"指针 + 一句话摘要；**叙事（设计理由、不变量、时序图、评审点结论）永远整段保留在文档里**，代码不承载这些。例外：D12 之后事件 payload 散落在各 ruleset 的 `state-machine.ts`/`settlement.ts` 内联对象字面量里，没有集中类型可指——这类表格继续整份保留，是唯一的汇总视图。**尚未实现的消息/字段**不能指代码，必须保留完整 spec。

## 5. 阶段设计内容的分流规则

**文档按主题命名，不按阶段命名；阶段只是主题文档的产生时机。**

- 有跨端契约或长期解释价值 → 写成/写入主题规格文档（`contracts/*.md`/`variants/*.md`）、`architecture/*.md` 或 `decisions.md`（产品级）
- 仅本阶段实施推演（任务拆分、顺序、临时权衡）→ `process/plan.md` 阶段区，或当推演内容较长时另立 `process/<phase 简称>.md` 由 `plan.md` 链接过去（过程性，两种情况都在阶段收尾时按 §6 吸纳耐久内容后清理/删除）
- 诱惑测试：想建带阶段号/日期的设计文档时自问"三个月后有人会按这个名字找它吗"——不会，就分流
- **新增（本次重构引入）**：想把某段逻辑从 `variants/*.md` 提取进 `contracts/*.md`/`architecture/key-designs.md` 时，先查 `architecture/variant-boundary.md` 的转正条件，达标才提取，不确定就继续留在玩法专属文档里复制

## 6. 阶段收尾·吸纳仪式（验收时固定动作，约半小时）

0. 本阶段设计内容按 §5 分流归位
1. 架构级变更 → 追加 `decisions.md`
2. 影响系统叙事的 → 更新 `architecture/*.md` 对应段落（多数阶段无）
3. 规格文档清理过程标注——代码+测试已承载的内容，文档只留契约，删过程
4. `process/plan.md`：勾阶段、写下一阶段第一个具体动作、删已完成阶段的任务细节
5. CLAUDE.md 预算审计；代码地图是否需更新
6. 漂移审计：docs 所述与代码所做是否一致（十分钟走查）
7. **新增**：`architecture/variant-boundary.md` 复审——本阶段是否有机制的"已验证玩法数"发生变化，是否有条目达到转正条件
