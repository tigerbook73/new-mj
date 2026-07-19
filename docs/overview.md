# 项目一页纸

> 入口文档：给第一次接触本项目的人（含 AI）一条最短路径，看懂"这是什么、现在到哪了、该往哪读"。不讲原理与取舍，那是下一步的事。

## 这是什么

一个多玩法在线麻将：Web + 移动端客户端，真人与 AI 混桌，多局并行。核心思路是"一套引擎骨架 + 每个玩法独立实现"，而不是先设计一套通用麻将框架再往里塞规则——具体原因见 `architecture/variant-boundary.md`。

## 需求基线（不变部分）

1. Web + 移动端 App
2. 多玩法：垃圾胡（第一，验证架构）→ 血战到底（第二）→ 后续扩展（计划内含日麻）
3. AI 与真人混桌（必须有真人）
4. 多局并行
5. Google/GitHub 登录
6. 架构可扩展即可，允许边界重构
7. 非商用，不做数据兼容（可清对局表，保用户表，单向引用 userId）

完整阶段路线与当前进度见 `process/plan.md`。

## 现状

规则、core 引擎、server、web 竖切、垃圾胡 AI 对战/UI/Replay，以及事件日志/战绩 PG 持久化和真正的 Supabase OAuth 均已完成；OAuth 已通过本地 Supabase 容器使用真实 Google/GitHub 账号做端到端验证，尚未正式部署到云端。当前工作转为垃圾胡 Table UX 分阶段重做，进度见 `process/plan.md`。文档结构本身是在 server 完成、web 开工前重构的，见 `doc-map.md` 的 v2 说明。

## 阅读地图

| 你是谁                    | 怎么读                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新人，想快速理解系统      | `architecture/system.md`（系统长什么样）→ `architecture/key-designs.md`（为什么这么设计）→ `decisions.md`（懂取舍）                                                                               |
| 想加一个新玩法            | `architecture/variant-boundary.md`（哪些能复用、哪些必须自己写）→ `contracts/engine-contract.md`（要实现哪些接口）→ 抄一份最接近的 `variants/*.md` 做模板 → `testing-strategy.md`（最低验收要求） |
| 想改协议/房间逻辑         | `contracts/protocol-shared.md` / `contracts/session-mechanics.md`                                                                                                                                 |
| 想查具体某个玩法的规则    | `variants/junk.md` / `variants/bloodbattle.md`                                                                                                                                                    |
| 想知道某个技术选择的理由  | `decisions.md`（append-only 决策记录，位置不变；精简例外见 `doc-map.md` §2.2）                                                                                                                    |
| Claude Code / AI 会话开工 | 根级/包级 `CLAUDE.md`/`AGENTS.md` → `process/plan.md` 状态区 → 按需读契约与规则文档                                                                                                               |

## 文档结构总览

```
overview.md                     ← 你在这里
architecture/
  system.md                     部署视图、包拓扑、工程结构
  data-model.md                 核心数据模型（概念级）
  key-designs.md                跨玩法设计模式（事件溯源/可见性/声明窗口/壳+dispatch）
  variant-boundary.md           公共 vs 玩法专属边界判定与台账
contracts/
  engine-contract.md            core 引擎公共契约（四签名、事件信封骨架、dispatch 方法）
  protocol-shared.md            通用协议（握手、ack/事件模式、错误码）
  session-mechanics.md          房间/会话容器骨架（不含具体计分/排名/庄家公式）
variants/
  junk.md                       垃圾胡：规则+专属类型+专属协议+跨局规则
  bloodbattle.md                血战到底：同上
testing-strategy.md             测试策略（先定后做）
process/
  plan.md                       阶段路线与状态（过程文档）
  workflow.md                   流程细则（过程文档）
decisions.md                    决策记录（append-only，记录级；精简例外见 doc-map.md §2.2）
```

> 文档归属与维护规则见 `doc-map.md`。
