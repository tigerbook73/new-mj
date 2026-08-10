### 需要优先处理

1. 2-ply 的即时胡牌奖励量纲不一致

probeSelfDrawTwoPly 返回的 winProbability 是 0~1，但 continuationValue 是手牌评分值，生产路径直接相加：

packages/ai/src/junk/strategy.ts:885

probe.continuationValue + probe.winProbability + discardSafety

这会导致“下一张直接自摸”的价值最多只增加 1，通常远小于向听/番型评分。注释也明确说 terminal payout 尚未建模，但当前默认策略已经使用了这个结果。

建议在正式合并前二选一：

- 引入明确的 selfDrawWinValue；
- 或暂时不把 winProbability 加入生产评分，只作为诊断数据。

这是当前最值得先定下来的策略语义问题。

2. policy-loader 权重覆盖测试失败

当前结果是：

expected discard tile 0
received discard tile 4

历史策略加载测试已通过，因此不是 git ref 或 JSON 路径加载失败。更像是测试把“权重变化”错误地等同于“最终动作必变”；当前动作已经经过 2-ply、候选裁剪和后续分支评分。

建议把这个测试改成：

- 直接验证加载后的权重会改变 scoreHandShapeAfterDiscard 的安全分数；
- 或比较 scoreLegalActions 中对应动作的分数差；
- 不要依赖最终 argmax 必然切换。

现有 packages/ai/src/junk/strategy.test.ts:846 已有更稳定的安全权重增量测试，可以复用这个模式。

### 重构机会

3. strategy.ts 职责过多

目前同时包含：

- 手牌结构分析与缓存；
- 概率模型；
- 2-ply 搜索；
- cliff 候选裁剪；
- claim/anGang/buGang 模拟；
- 动作评分；
- softmax 和策略入口。

建议后续拆成：

strategy/
hand-quality.ts
analysis-cache.ts
two-ply.ts
action-scoring.ts
strategy.ts

这不是合并前必须做的功能性重构，但目前文件已超过 1,000 行，继续调参会越来越难定位影响范围。

4. 两变化 DP 的测试覆盖还不够匹配风险

createTwoChangeShantenProber 是本分支最复杂的 core 优化，但当前新增矩阵 API 主要只有一个固定 fixture；已有随机测试覆盖的是普通 ukeire，不是完整的“删牌 + 加牌”矩阵。

建议补充至少 1,000 组随机等价性测试，覆盖：

- 同花色 / 跨花色；
- sevenPairs: true/false；
- existingMelds: 0..4；
- drawKind === discardKind；
- 已持有 4 张的跳过逻辑。

5. 可选性能优化点

这些暂时不要凭直觉修改，先 benchmark：

- packages/ai/src/junk/strategy.ts:570 每个牌种都重新 Array.from(...).find(...)；
- packages/ai/src/junk/strategy.ts:878 每个摸牌分支都新建 Set；
- 2-ply 批量 API 只复用了 shanten，叶子 evaluateUkeire 仍会重新计算完整进张。

总体上，core 的 batch 重构边界是合理的；当前不建议继续扩大 core 抽象。优先顺序应是：

1. 明确即时胡牌评分；
2. 修正/重写权重覆盖测试；
3. 补两变化 DP 随机等价性；
4. 再拆 strategy.ts 和做性能 benchmark。

当前验证状态：core verify:full 通过；AI 目前因 policy-loader.test.ts 1 个失败未全绿。

## 处理结论（2026-08-10）

- 权重覆盖测试已改为验证加载后的评分增量，避免被 2-ply 最终动作选择偶然性误导。
- 2-ply 的原始 `winProbability` 已从生产评分移除；即时自摸分支暂回退一轮评分，等待终局收益模型。
- 牌墙耗尽回退、公开对手副露活牌扣除、snapshot CLI 副作用拆分、label 路径防护、历史 ref 测试、权重加载逻辑复用和 `ukeire` JSDoc 均已完成。
- 两变化 batch API 增加 1000 组随机等价性回归；相关 AI 策略/CLI 定向测试 39/39、core shanten 测试 15/15 通过。
- 性能优化和 `strategy.ts` 拆分暂不采纳，待独立 benchmark 和小步重构计划。
