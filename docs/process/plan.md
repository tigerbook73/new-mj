# 待完成任务与当前状态

> 本文件只记录当前工作、阻塞/遗留问题、下一步和 Backlog；专题完成后的耐久结论归档到对应架构/契约文档。

## 当前任务

当前专题：关闭 Junk AI 决策质量优化分支，并准备人工合并到 `main`。

当前收尾动作：处理两份 code review 的合并前问题，并完成受限环境外的最终 verify。

当前实现目标：

- 默认 Junk AI 使用两轮快速过滤的 2-ply；
- 首轮上断崖：`minN=2`、`maxN=4`、阈值 20%；
- 第二轮下断崖：`minN=1`、`maxN=all`、阈值 20%；
- 2-ply 结构计算统一使用 core `evaluateUkeireAfterDiscardDraws`；
- 当前基础权重保持不变；后续参数调优另开分支处理。

## 已完成并保留

- 概率评分、墙牌比例模型、既有副露 ukeire 修复和结构分析缓存；
- core suit table / shanten prober 优化及完整测试；
- core 两变化结构 batch API；完整 2-ply 端到端约减少 11% 耗时，决策结果与旧路径一致；
- 两轮断崖 2-ply 候选方案，固定上下阈值 20%；
- 通用 arena、权重 A/B、调参和代码版本对比工具；
- 正式策略所需的回归 fixture 和测试。

## 本轮清理范围

删除未采用路线的过程实现和专用材料：

- 固定 Top-N、结构 Top-4、最低向听黑名单等实验代码；
- 共享缓存、摸牌状态重叠、full-result batch 等实验代码；
- two-ply benchmark、baseline、对抗性搜索、结构化 runner 及其 CLI、worker、测试和数据；
- 对应 package/root 脚本和失效文档引用。

保留后续参数和代码 A/B 所需的 arena、tune、compare-weights、decision-diff、policy-loader、snapshot 及其测试。

## 收尾步骤

1. [x] 完成正式 2-ply + core batch 的生产路径重构。
2. [x] 完成未采用实验代码、数据、CLI 和文档引用清理。
3. [x] 既有正式路径回归测试通过：非弃牌动作、胜牌、声明、缓存和温度采样均有覆盖。
4. [x] 完成 AI/core 类型检查、lint、测试和构建；验证结果见下文。
5. [x] 将保留内容、删除内容、限制和验证结果写回本文件。
6. [x] 提交当前分支的最终整理提交（`10bc8c3`），确认工作区干净。
7. [x] 综合两份 review，修复合并前问题并补充回归测试。
8. [ ] 在非受限环境执行最终 AI/core verify，随后停在人工合并前：不切换 `main`、不执行 merge/squash merge、不推送、不删除当前分支。

## 验收标准

- 默认 Junk AI 确实走两轮 2-ply；
- 默认 2-ply 路径使用 core batch；直接 probe 调用保留兼容性 fallback；
- 未采用实验材料已清理；
- 后续参数 A/B 工具仍可运行；
- `pnpm --filter @new-mj/ai verify:full` 通过；
- `pnpm --filter @new-mj/core verify:full` 通过；
- `git diff --check` 通过且工作区干净；
- 输出人工合并命令和注意事项，但不执行最终合并。

## 本轮验证记录

- AI typecheck：通过。
- AI lint：通过。
- AI strategy 定向测试：32/32 通过。
- AI build：通过。
- AI 全量测试：业务测试通过；`policy-loader.test.ts` 的 2 个测试在受限环境中因 `spawnSync git EPERM` 失败，随后测试进程未正常退出，未将该环境问题伪装成全绿。
- core `verify:full`：19 个测试文件、192 个测试通过，构建通过。
- `git diff --check`：通过。
- review follow-up 定向测试：AI 39/39、core shanten 15/15 通过；AI/core typecheck 与 lint 通过。
- 受限环境下 policy loader 的 git ref 测试仍会报 `spawnSync git EPERM`，需在非受限环境完成最终 verify。

## 阻塞与遗留问题

- 分支关闭后，基础权重和断崖参数需要另开独立计划；
- 2-ply 仍是启发式评估，不是完整牌局价值证明。
- 2-ply 终局收益模型、断崖窗口 batch 合并、strategy.ts 拆分和断崖参数调优留待独立 benchmark/计划。

## Backlog

- Mobile 横屏/竖屏布局与 Expo 路线；
- Junk Table UX：Replay、慢网络反馈、声明超时行为及 E2E；
- 评估 `immer` 替代 ruleset 手写 `cloneState`，先验证 fuzz 性能；
- 下次改动杭州/垃圾胡 view 时评估提取共享 PlayerView 回放逻辑；
- 下次改动结算 Overlay 时评估提取共享 `RoundEndOverlayShell`。
