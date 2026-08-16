# Junk 普通型结构策略性能与 A/B slice

## 目标与验收

新增只供 evaluation 使用的 `structural compare` 命令，在固定 seed 上比较当前 weighted
生产策略与普通型 structural 影子 facade。报告必须可重建、只写临时产物，不切换默认入口。

## 配对与统计契约

- 每个 seed 运行两个相同轮数的 match：第一场 structural 坐 0/2，第二场坐 1/3；weighted
  占据其余座位。两场复用同一个 match seed，因此初始牌墙和庄家序列一致。
- 分数按策略而非座位累计；每场 structural 总分大于 weighted 记一胜，相等记一平。
- policy wrapper 使用单调时钟测每次决策耗时，分别报告 weighted/structural 的样本数、P50、
  P95 和最大值。该墙钟指标只允许同一机器、单并发运行内比较。
- 保存全部输入 seed、每场 split、双方分数和失败；`STEP_LIMIT_EXCEEDED` 单独计数。任何失败
  都使门禁不通过，但命令仍输出完整报告供复现。

## 边界

- 小样本只发现非法动作、死循环、明显性能不可接受和强烈质量信号，不证明胜率或终局 EV。
- 进入默认切换前的固定筛查门槛为：15 seeds / 30 次换位 match 无失败和步数上限，structural
  决策 P95 不高于 50ms（此前 bounded 1000 场诊断 P95 约 33--34ms，预留完整流程余量），
  structural 总分不低于 weighted，且 canonical 普通型 fixture 不出现明确牌理回退。
- 七对、番型、防守及其他玩法差异不作为本轮普通型实现 bug；明确普通牌理反例需用固定
  fixture 复现，不能仅凭一场输赢推断。
- 命令只依赖现有 arena/core 驱动，不进入普通 `verify`；纯聚合与 CLI I/O 使用快速单测。
