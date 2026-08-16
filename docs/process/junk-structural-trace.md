# Junk 普通型结构质量 trace slice

## 目标与验收

对扩大 A/B 中配对净差最差的 match seed `2889165442` 重放两个 mixed-policy split；在每个真实
玩家视角上同时计算 weighted 与 structural 推荐，保存所有分歧的 round/step/seat、phase、
legalActions、完整 `JunkPlayerView` 和两路动作。报告必须复现原配对分数并按动作对汇总。

## 边界

- 一路策略实际驱动状态，另一路只在相同 view 上做 shadow 推荐；shadow 动作不应用到 core，
  因此该节点的两路选择可直接比较，但不能声称 shadow 后续仍会到达相同状态。
- trace 只写临时 evaluation 产物，不归档隐藏牌墙，不改生产入口或评分。
- 首先区分 discard/claim/flow 分歧；只有能从保存 view 重建且人工确认的普通牌理问题，才固化
  为 canonical fixture。单场最终分数不能直接归因给任一分歧。

## 当前结果

目标 seed 的两个 split 精确复现 structural `-15/-4`，共 665 个决策点、170 个同视角分歧
（25.6%）：148 个 discard->discard，18 个 pass->peng，3 个 pass->chi，1 个 chi->chi；无
draw/win/gang 分歧。首个弃牌分歧中结构选择在相同条件期望向听下有更多进张种类/张数；
18 个 pass->peng 中 13 个降低 1 向听、5 个同向听扩大进张，3 个 pass->chi 中 2 个降低
1 向听、1 个同向听扩大进张。trace 未发现违反现有结构排序的实现错误，也不能把最终失分
归因给某一个节点；下一步应通过 claim/discard 混合策略消融定位缺失价值所在组件。
