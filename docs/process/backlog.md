# Backlog

> 本文件专门管理尚未被用户选定的候选专题。候选不代表当前承诺；开始哪一项由用户明确选择，助手不得自动挑选。

## AI 与玩法

### 番型路线收益模型可行性：剩余番型（杠开）

前四个 slice 已完成并入生产：

- 门清 claim 阈值（见 `docs/architecture/shanten.md`"门清 claim 阈值"节）：不合成分数换算，
  改用离散阈值（chi/peng 需领先 pass 至少 1 级向听才允许打破门清）经自对弈 A/B 选定；对 pass
  自身向听分档未能稳定超过 flat 阈值，未采纳，维持简单常数。
- 碰碰胡弃牌 tiebreak（见 `docs/architecture/shanten.md`"碰碰胡结构路线"节）：碰碰胡向听是
  闭式公式（不需要新 DP 表），但裸比较（无门槛）在 A/B 里明显跑负——远距离碰碰胡向听在标准型
  真平局上做 tiebreak 是无信息量的噪声取舍；加一道"只有两候选碰碰胡向听都 ≤ 阈值才生效"的
  门槛后随阈值收紧单调转正，最终采用阈值 2。
- 清一色/混一色弃牌方向（合并分析，见同文件"清一色/混一色弃牌方向"节）：花色定向向听直接
  复用现有 `evaluateUkeire`（喂过滤子集，不要求输入正好 13/14 张），不需要新 DP 或 Layer 2
  财神装饰层；scoped 到弃牌 onePly+最终 tiebreak，不碰 claim、不与七对组合。原计划仿七对做
  分档惩罚，扫过后发现在这个窄 tiebreak 接入点上惰性、无效果，已移除。碰碰胡与清一色/混一色
  两个 tiebreak 在 `compareFinal` 中各自独立生效、互不干扰（顺序为 continuation → flush →
  onePly → pengpenghu），但集成时未专门验证过二者组合场景的 A/B 效应。

这条经验对"距离很远的次要路线"tiebreak 普遍适用：接入前都该假设需要类似门槛，而不是默认裸
比较就安全。

杠开仍是候选，不假设能直接照搬前几者的做法：只在自摸且连杠链不断时生效，属于时机/连续动作
问题而非构牌方向问题，可能根本不适合同一套"claim 阈值"/"discard tiebreak"框架。开始前先
评估现有 `structural-routes.ts` 的
`classifyOrdinaryStructuralGate`（`specialSignals: ["flush","all-pungs"]`，目前只做纯诊断/
排除生产、不做引导）能否复用为构牌信号基础。不把不可靠的胡牌概率伪装成诊断真值。

### 杭州与血战到底玩法专属 AI

待相应玩法稳定、路线和收益模型明确后，再单独设计玩法专属策略；不从 Junk AI 方案自动推广。

## Web 与桌面体验

### Mobile 横屏/竖屏布局与 Expo 路线

确定 mobile 的横竖屏布局、Expo 集成边界和最小可验收 slice。

### Junk Table UX

包含 Replay 牌面渲染、逐步 god 动画、慢网络反馈、声明超时归零的 `DeadlineCountdown` 行为及 E2E。当前阻塞点：归档只有局终 `finalState`，若要逐步 god 动画，需要新的 core 归档能力，或重新评估 Replay 不重跑 `applyAction` 的既有设计；这是架构级决定。

### 结算展示：放铳牌进入结算展示区

结果 panel 的阅读顺序、赢家/和牌/番型、庄家倍率、积分、实时提示和胡牌张高亮已完成；剩余候选是定义结算展示区的具体目标位置，并增加放铳牌从牌河落入该区域的飞行动画。开始前先明确目标位置，再参考现有 `ClaimFlipGhost`/`DiscardFlipGhost` 的 `TileFlightPortal` 模式。

### 共享 `RoundEndOverlayShell`

三套结算 Overlay 存在动画常量、外层壳 JSX 和底部按钮区重复。下次实际改动这组组件时评估提取共享壳层，各玩法只保留标题与番型详情；不提前抽象。

## Core 与跨玩法结构

### 暂停的 AI/Core 长跑测试恢复

当前自动门禁只保留不可替代的正确性覆盖；以下长跑暂不执行，恢复时先把“测试管线正确性”和“有意义的统计/效果评估”分开：

- `packages/ai/test/junk-arena.test.ts`：30 局 zero-sum 与强弱席位统计比较暂停；前者已有 core 结算守恒与单局 arena 接线覆盖，后者属于质量评估而非正确性断言；
- Junk/杭州各自独立的“100 seeded games finish while preserving tile conservation”暂停，因为同文件的 replay + 100 局 fuzz 已覆盖规则执行与守恒；若未来拆走 fuzz 中的守恒断言再恢复；
- 血战自动门禁保留 100 局 fuzz；专题收尾或玩法语义改动后的 10000 局全量接受测试改为人工运行，不常驻 `verify:full`。

恢复这些用例前要求单条稳定低于自身 timeout 的一半，并且整套 `verify:full` 不依赖共享机器的瞬时负载才能通过；不得只靠提高 timeout 恢复。

### `immer` 与 ruleset 手写 `cloneState` 的取舍

先做性能和 fuzz 对照，不预设替换结论；若修改 core，遵守 core 验证门槛。

### 共享 PlayerView 回放逻辑

第三个同构玩法出现，或下次实际改动杭州/Junk view 时，评估是否将重复的 PlayerView 回放逻辑下沉到 `lib/`；不提前抽象。

### 血战到底专属桌面体验

包含换三张、定缺、血战状态和完整操作 UI；待玩法路线和产品范围明确后再立项。

### 日麻立项

日麻立项时复审 `architecture/variant-boundary.md`，再确定规则、协议和专属 UI/AI 的边界。

## 选择规则

- 用户指定候选名称后，才将其建立为当前任务并写入 `plan.md`。
- 未被选择的候选只保留在本文件，不进入当前实现计划。
- 候选如改变契约、架构边界或玩法范围，先按 workflow 建立设计计划。
