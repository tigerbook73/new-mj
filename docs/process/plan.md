# 待完成任务与当前状态

> 本文件只记录当前工作、阻塞/遗留问题、下一步和 Backlog；专题证据与详细提案见专题文档。

## 当前任务

当前专题：Junk AI 决策质量优化，详见 [`junk-ai-decision-quality.md`](./junk-ai-decision-quality.md)。

当前状态：

- Phase 1 的概率评分、迟疑阈值、既有副露 ukeire 修复和有界结构缓存已完成。
- 2-ply 自摸诊断探针已有目标/反例 fixture，但尚未接入默认评分；当前完整探针约 13.3–13.6ms/probe。
- core prober 已完成无语义拆分；继续拆单花色 solver/table-builder 已拒绝。
- core batch API 提案已写入专题文档，待架构边界确认；确认前不实现、不接入默认 AI。

下一步第一个具体动作：将 core batch API 的接口形状和性能边界提回 Claude Project，
确认后再执行“实现 API → 逐叶正确性 A/B → 诊断接入 → 默认准入”流程。

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
