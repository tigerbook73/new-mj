# 待完成任务与当前状态

> 本文件只记录当前工作、阻塞/遗留问题、下一步和 Backlog；专题证据与详细提案见专题文档。

## 当前任务

当前专题：Junk AI 决策质量优化，详见 [`junk-ai-decision-quality.md`](./junk-ai-decision-quality.md)。

当前状态：

- Phase 1 的概率评分、迟疑阈值、既有副露 ukeire 修复和有界结构缓存已完成。
- 2-ply 自摸诊断探针已有目标/反例 fixture，但尚未接入默认评分；当前完整探针约 13.3–13.6ms/probe。
- Top-N 2-ply 已完成修正概率模型后的 32 手牌/96 case A/B：1-ply/Top-1/Top-2/Top-3 相对全量 2-ply 一致率为 71.9%/71.9%/87.5%/93.8%，存在明显决策漂移，拒绝直接接入默认评分。
- Top-2 分差触发全量的分级 2-ply 已评估：阈值 0–2 仅约 96.9% 一致且回退约 69%–72%；阈值 5 才全一致但回退 90.6%、估算更慢，拒绝该判据。
- 以 1-ply 排名/分数作为 2-ply 安全上界的剪枝已否定：修正后 Top-1 相对全量 2-ply 仅 71.9% 一致，不能证明未评估候选不可能胜出。
- 结构副产品筛选已完成 1000 个确定性随机手牌 A/B：结构 Top-4 一致率 93.1%、约 34.13ms/case；全量约 97.15ms/case，约 2.85x，但仍有 6.9% 漂移，暂不接入默认评分。
- core prober 已完成无语义拆分；继续拆单花色 solver/table-builder 已拒绝。
- 高潜候选已拆成两条路线：不改公共接口的 AI/内部实现路线，以及待架构确认的 core batch API 路线；所有候选先评估/测试，再决定接受或拒绝。

下一步第一个具体动作：等待并提回 core batch API 的架构确认；确认后实现批量 API 的逐叶等价 A/B，同时保留现有 AI 层候选剪枝为拒绝结论。

## 阻塞与遗留问题

- 庄家疑似不是每局最先出牌的人：下次处理先写最小复现用例，再定位庄家判定或出牌顺序。

## Backlog

- Mobile 横屏/竖屏布局与 Expo 路线。
- 结算展示：放铳牌从牌河飞入结算展示区，先定义结算区目标落点。
- Junk Table UX：Replay 逐步牌面、慢网络反馈、声明超时归零行为及 E2E；逐步 god replay 受终局归档模型限制，需架构决定。
- 评估 `immer` 替代 ruleset 手写 `cloneState`，先验证 fuzz 性能。
- 下次改动 `hangzhou/view.ts`/`junk/view.ts` 时，评估抽取重复 PlayerView 回放逻辑。
- 下次改动结算 Overlay 时，评估提取共享 `RoundEndOverlayShell`。

## 待定内容

- 血战到底专属桌面体验：换三张、定缺、血战状态与操作 UI。
- 日麻立项时复审 `architecture/variant-boundary.md`。
- AI Bot：杭州与血战到底的玩法专属策略；日麻立项后再实现其策略。
