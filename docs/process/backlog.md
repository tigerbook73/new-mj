# Backlog

> 本文件专门管理尚未被用户选定的候选专题。候选不代表当前承诺；开始哪一项由用户明确选择，助手不得自动挑选。

## AI 与玩法

### 正式 AI play 的 player 上下文与缓存观测

独立记录每个 AI player 在正式 play 中的可诊断上下文，包括使用的 AI 策略/版本、配置或权重版本、决策时的关键状态摘要、已计算结果的缓存命中/未命中和缓存生命周期信息。

建议拆成几个可独立验收的 slice：

- 先定义 server/AI 内部的 decision context schema 和采集开关，默认不进入 PlayerView、协议或客户端；
- 记录策略版本、规则/配置版本、seed 或可重放标识、决策耗时、候选摘要、选中动作和 cache statistics；
- 明确缓存按 player/seat/hand 的作用域、创建/清理时机和容量上限，禁止无边界跨局增长；
- 提供 debug/diagnostic 查询或结构化日志的最小读取方式，再评估是否需要持久化或接入报告；
- 用代表性 play 验证关闭采集时生产行为和热路径开销不变，开启采集时上下文可重放且不泄露不应公开的 TileId/牌面。

该专题与当前普通牌形校准的关系：当前 calibration 只记录评估运行级别的性能、cache 命中和报告；正式 AI player 上下文属于生产观测能力，不自动并入 step 0。完成后可作为 snapshot/replay 场景来源，但不能把生产日志直接当作牌理真值。

### Junk AI 大规模调参与权重采纳

运行一次真实规模的 `pnpm --filter @new-mj/ai evaluate weights tune`，人工 review 报告后决定是否用 `--write` 采纳候选权重，或手动更新 `default-weights.json`。不把自对弈胜率直接当作牌理真值。

### 严格结构支配护栏与 isolation 重新评估

先在生产候选选择前只过滤同向听层中被存活进张种类和张数严格支配的弃牌，再重新评估将 `isolationPotential` 从 `1.5` 降为 `0`。必须保留向听与进张宽度冲突、Pareto 不可比较候选；用 canonical fixture、paired held-out 和同种子自对弈共同验收，不因 isolation=0 单独自对弈占优就直接采纳。

### Junk AI 自我优化基础设施推广评估

评估 Feature 参数化、自对弈 arena、调参脚本和调参算法是否适合杭州/血战到底。可复用 Layer B（打分求和）、Layer C（强度旋钮）和 Layer D（自对弈引擎/调参算法）的模式；玩法专属 Feature 抽取仍需各玩法单独设计。

### 番型路线收益模型可行性

普通牌形校准完成后另开专题，评估番型数据、收益模型和可验证边界；不把不可可靠的胡牌概率伪装成诊断真值。

### 七对与其他特殊路线生产化

普通标准型结构策略稳定进入生产后，再评估已建立的 `structural-routes.ts` 如何接入弃牌 shortlist、
2-ply 叶子和 claim/gang 边界；七对、番型、防守及其他特殊路线不作为当前普通型生产切换的
前置条件，不通过恢复连续权重或隐式合并 core 的 `sevenPairs: true` 提前接入。

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

- `packages/ai/test/junk-weight-tuning.test.ts`：真实自对弈调参循环整体暂停；先为 tuner 注入便宜、确定性的 evaluator，用小样本覆盖不可变默认值、收敛、sigma 上限、复现性和 `weightKeys`，真实调参继续通过 `evaluate weights tune` 手工运行；
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
