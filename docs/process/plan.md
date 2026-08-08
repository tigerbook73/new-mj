# 待完成任务与当前状态

> 本文件是待完成任务列表与当前任务状态记录，不是项目年表。只保留当前专题、其仍有参考价值的已完成前序片段、阻塞/遗留问题和有序 Backlog；专题完成后删除其状态与完成记录，将耐久结论分流到 contracts、architecture 或 variants。

## 当前任务

当前专题：Junk AI 决策质量结构性缺口，按验证优先→算法逻辑→高风险不确定 三档排序推进
（讨论见 Backlog 中"权重之外的基本逻辑缺口审计"及其下③④两条）。第一档（④+④-b
花色集中/间距/位次验证）已完成并收档。第二档第一项（③ 自摸渠道池子修正）已完成，
详见下方"权重之外的基本逻辑缺口审计"条目；碰/吃渠道区分工程量超出"不引入新参数"
范围，已改归入 Phase 2 一类，不再算第二档任务。

下一步候选（未选定）：① 评估 `isolationPotential` 是否该简化/去掉（④-b 验证已发现
它可能与 `tenpaiProbabilityWeight` 链路的信号重复，但honor-vs-number 这条区分轴是否
也已被 ukeire 隐式捕捉还未验证，需要专门 fixture 对比，不能凭推理下结论）；②
吃/碰迟疑阈值 δ hurdle（引入新参数，departs from"不依赖参数配置"，需要重新确认是否
仍算第二档还是该挪到第三档）。

Shanten/Ukeire 共享底层重构 Phase 1 已全部完成并收档：分层设计与长期决策
沉淀至 `docs/architecture/shanten.md`，算法/存储细节在 `packages/core/src/
lib/shanten-suit-table.ts` 顶部注释，性能演进见 git history（`perf(core):`
系列 commit）。端到端自对弈耗时累计降约 11.9x，`verify:full` 全绿。后续
动作转入 Backlog。

Junk AI 自我优化基础设施专题（强度旋钮 / 自对弈 session 驱动器 / 权重参数化 + 手写 (1+1)-ES 调参脚本）已全部完成，`pnpm --filter @new-mj/ai verify:full` 全绿，详见 `packages/ai/AGENTS.md` 与 `packages/ai/src/junk/{strategy,arena,tune,tune-cli,tune-pool,tune-worker}.ts`。后续加了两轮跟进：

- 性能：`worker_threads` 并行跑对局（`tune-pool.ts`，手写不引第三方库）+ `standardShanten` 递归 memo 跨同回合候选手牌共享 + `node --cpu-prof` profiling 定位到 `TileSet.kinds.indexOf` 线性扫描（改成 O(1) 的 `kindIndexOf`，见 `packages/core/AGENTS.md`）——同一个调参样例耗时从 80s 降到 11s（约 7x），全程报告逐字节一致、`verify:full` 含 1000+ 局 fuzz 确认无回归。
- 调参算法自己判断收敛并提前停（sigma 缩到阈值、或连续多代无变异被接受），不再需要人工猜 `--max-generations`；权重默认值从硬编码 TS 改成 `packages/ai/src/junk/default-weights.json`，`tune-cli.ts` 新增 `--write`（仍需人工显式传参，held-out 评估变差时自动跳过写入）。

后续动作转入 Backlog。

## 阻塞与遗留问题

- 疑似 bug（未复现/未定位）：庄家好像不是每局最先出牌的人。下次处理时先写最小复现用例（哪个玩法、第几局、庄家轮换是否正确）确认现象，再定位是庄家判定错了还是出牌顺序错了。

## Backlog

- 规划并实现 mobile 横屏/竖屏布局与 Expo 路线。
- Junk AI Phase 1 已完成并收尾（2026-08-08）：`strategy.ts` 的 `JunkWeights.improvementWeight`
  改名为 `tenpaiProbabilityWeight`，用超几何进张概率（`tile-probability.ts`）替代原来
  "活牌数线性加权、不区分开局/残局"的打分方式。为此新增了一套可复用的跨版本/跨配置 AI
  效果评估工具链（`policy-loader.ts`/`decision-diff-cli.ts`/`compare-weights-cli.ts`
  跨版本对比 + 并行/`snapshot-junk-cli.ts`/`tune-cli.ts --only`，规则与用法见
  `packages/ai/AGENTS.md`）。用它评估后发现一个意外的系统性副作用（AI 更不愿意吃/碰，
  因概率项饱和而 menqing 固定成本不变），权衡垃圾胡番型的乘法连乘计分结构（丢门清直接
  砍半最终分）后决定**接受**，并补了 `strategy.test.ts` 的 "still pengs when doing so
  reaches tenpai" 回归测试锁定下限。`pnpm --filter @new-mj/ai verify:full` 全绿，
  改动尚未 commit。

  **消融实验补充验证**（2026-08-08，`compare-weights-cli.ts` 手工构造权重文件、其余
  12 项权重清零，只留 `shantenWeight`/`tenpaiProbabilityWeight`/`menqing`，逐点扫描
  `tenpaiProbabilityWeight` ∈ {5,10,...,100}，每点 1000 场）：① 保留 `menqing=8` 时，
  5–40 区间稳定赢纯 shanten 基线约 52–53%（这次会话里信噪比最干净的一次正向信号），
  但过 40 后逐渐回落、100 时跌破 50%；② 把 `menqing` 也清零后，5~100 全部固定在
  54.8%，权重大小完全不影响结果——数学上可解释：向听打平时的概率项是单调标度，权重
  多大都不改变候选间的相对排序，只有在"要不要为了概率提升而开手（牺牲 menqing）"这类
  跨项决策里权重大小才会真正起作用。两组对比坐实了①里"过大回落"的根因就是
  `tenpaiProbabilityWeight` 与 `menqing` 的交互，不是撼动了 `shantenWeight`；也说明当前
  `tenpaiProbabilityWeight=25` 稳稳落在①测出的安全区间内，真实公式里 `menqing` 之外还
  有清一色/碰碰胡等项能进一步补偿开手代价，25 大概率偏保守而非偏激进。

  **中局 ukeire 门槛已去掉并合入**（2026-08-08）：`handQuality` 原来只在
  `shanten<=1` 时算 `ukeire`/`tenpaiProbability`（避免中局无收益穷举），shanten/ukeire
  性能提升后先做了基准测试（`compare-weights-cli.ts` 同权重两侧对拼，1000 场：有门槛
  10.5s、去门槛 16.4s，约 1.56x，判定可接受）确认可行，再正式去掉门槛。用
  `decision-diff:junk` 对比（含一次排除 `qingyise`/`hunyise`/`pengpenghu`/
  `isolationPotential` 干扰的消融版复测，确认效果不是被这些项带偏的）：分歧率
  13~17%，主效果是"更早、更坚决地打孤立字牌、保留数牌"（数牌 catchment 比字牌宽，
  真实麻将常识），不是最初设想的"碰不碰留灵活性"场景（吃/碰/过类分歧全程个位数）。
  已补 fixture 锁定该行为（`strategy.test.ts` 新增 "prefers discarding a lone honor
  over breaking a live number-tile cluster, even far from tenpai"），并修正一条因此
  从"强制打平"变成"有真实优劣"的既有用例（"does not reward breaking a genuinely
  redundant tatsu..."，断言从 `toBe(discardTatsuTile)` 改成两种列表顺序下都
  `toBe(discardHonor)`）。`pnpm --filter @new-mj/ai verify:full` 全绿。

- Phase 2（远期 EV：轻量 2-ply → 必要时 Monte Carlo rollout + 真实番数期望，呼应 `docs/architecture/shanten.md` "Layer 3 远期方向"）评估级，暂不实现：已确认 `scoreJunkHand`/`decomposeStandardWinningHand`/`decomposeSevenPairsWinningHand` 已是 `@new-mj/core` 公开导出，不需要新增 core API。`2-ply` 是评估框架（当前弃牌 → 按活牌概率枚举下一摸 → 此时选最佳弃牌 → 评估叶子手牌）；"进张后形状质量"是叶子评分手段，两者不是二选一——优先组合为轻量 2-ply + 少量经独立 fixture 验证的形状特征，而不是给间距本身加静态分。它应只在实际进张令后续搭子/二次进张/番型路线变好时奖励桥接价值；fixture 同时覆盖目标牌型与死桥接、边张、番型受损等反例，不能以自对弈胜率代替。未解决问题：① 2-ply/rollout 内部"打哪张"用什么策略模拟——递归调用当前评分函数最准确但成本比 Phase 1 高一个数量级以上，需要先做基准测试才知道能否进自对弈/调参闭环；② 只在什么 shanten 区间触发，避免全量候选都跑一遍；③ 完整 rollout 是否及如何模拟对手行动与真实番数；④ "D 层后是否到达和牌"这类链式结果没有闭式解。建议 Phase 1 上线观察一段时间后再评估是否启动；启动时第一步是先基准测试轻量 2-ply 探针（而非直接写完整 rollout），并先写目标/反例 fixtures。
- Junk AI「阻挡低价值吃碰」专题（2026-08-08 讨论记录，未启动，未选定方案）：现状 `scoreAction`（`strategy.ts:385-431`）里吃/碰分支与打牌共用同一套 `handQuality`（向听 + 进张概率 + `fanPotential` + `isolationPotential`），没有专门的吃碰价值判断——`fanPotential`（83-102行）虽然对 chi 有常量惩罚（关闭 `pengpenghu`/`pairBonus`/`meldBonus` track、开口扣 `menqing`），但都是人工挑的静态权重，不是"吃碰后期望得分会掉多少"的真实估算；`recommendJunkAction` 对 claim 和 pass 直接 argmax 比大小，没有阈值、没有机会成本概念。候选方向：① 给 chi/peng 分支加显式迟疑阈值（δ hurdle，claim 分数需比 pass 基线高出 δ 才通过），δ 按关闭的番型 track 数量、并随 `gameProgress`（残局放宽）动态调整，改动小风险低；② 把 `fanPotential` 换成真正的期望倍数（EV）模型（枚举收尾番型分支×达成概率求和，复用 core `scoring.ts` 倍数计算），更准确但改动面大、单次决策计算量上升——与本条上方 Phase 2 rollout 方向一致，可合并考虑；③ chi 与 peng 应设不同门槛（chi 同时伤门清+碰碰胡+清一色三条线，peng 只伤门清）；④ 用已有 `decision-diff-cli`/`compare-weights-cli` A/B 工具量化任一改动对"低价值吃碰频率"与实际胜率/得分的影响，避免主观调参。下一步第一个具体动作（若启动）：先做①（成本最低），跑 A/B 工具验证效果后再决定是否投入②。

  **权重之外的基本逻辑缺口审计**（2026-08-08，讨论记录，未启动，未定优先级）：排查权重
  取值之外的决策路径本身（`scoreAction`/`handQuality`/`argmaxAction`，`strategy.ts:311-518`），
  发现两处跟具体权重无关的结构性缺口：① **完全没有防守/放铳风险模型**——`safetyBonus`
  （265行）只对"现物"（他家牌河里已出现过的同张牌）加固定分，没有对手危险度推理（副露/
  打牌节奏暗示听牌可能性、筋/壁牌一类数牌相对安全推理），也没有攻守切换逻辑，AI 永远
  单向最大化自己的进张——这比番型权重更基础，是常见的麻将 AI 强度短板，此前文档/代码
  里完全没有记录。② **吃/碰决策没有迟疑阈值**——`argmaxAction`（471-481行）对 claim 和
  pass 直接比大小，没有"claim 必须显著优于 pass 才通过"的门槛，是决策结构问题、不是
  调参能解决的（与本条上方"阻挡低价值吃碰"专题的候选方向①同一件事，两条讨论可合并）。
  次要、优先级低：`remainingDraws`（198行注释已自承认）未建模吃碰导致摸牌轮次提前；
  `argmaxAction` 打平分时无 tie-break，纯看 `legalActions` 数组顺序。追加（2026-08-08，
  ④-b 验证后新增）：**`isolationPotential` 权重可能冗余**——位次差异（边张 vs 中张）
  已被 `tenpaiProbabilityWeight` 链路精确捕捉（见下方④-b 验证结论），`isolationPotential`
  二元固定加成是在已有信号上叠加不精确常数，评估是否该简化/去掉时一并处理。

  **③ 自摸渠道池子已修正（2026-08-08）；碰/吃渠道区分仍未做，改列入 Phase 2 一类**：
  原诊断——`tenpaiProbability`（`handQuality`，`strategy.ts:241-245`）用的
  `probabilityAtLeastOneDraw` 是纯超几何"至少抽中一次"模型，`populationSize` 用
  `gameProgressOf` 算出的 `unseenPoolSize` = 牌墙 + 其他三家隐藏手牌合并成一个池子，
  `draws` 却只用自己的摸牌轮次数 `ceil(wallCount/4)`——population 变大但 draws 没跟着
  变大，系统性低估自摸命中率。**已修**：改成 population=牌墙本身，successCount 按
  "牌墙 / 未见池" 的期望占比拆分改进牌活牌数（`wallShare`，不引入新可调参数，纯粹
  用可交换性假设把已有数据用对地方）。数值验证：中局同一活牌数下概率从 0.68 升到
  0.71（约 +0.025），残局阶段变化幅度更小（约 +0.005~+0.017）——幅度不大但方向一致、
  数学上更准确，已接受并记录（数值对比脚本+结论见本条，未落盘为文件）。已补 fixture
  `strategy.test.ts` "estimates self-draw probability from the wall alone..."，直接
  断言修正后概率的精确值、并断言严格高于旧的 merged-pool 公式会给出的值；
  `pnpm --filter @new-mj/ai verify:full` 全绿（72 用例，含慢速 arena）。

  **碰（三个对手都可能来源）/ 吃（只有上家一个来源）的真正区分，未做，改归为
  Phase 2 一类问题**：深入分析后发现这不是"population 换个数"就能做对的小改动——要
  正确算，得先知道 `ukeire()` 返回的每个改进牌种，具体是"补对子→碰"还是"补搭子→吃"
  完成的，但 `ukeire()` 目前只返回黑盒的"摸这些牌种能让向听下降"，不暴露结构分解
  信息，需要先从 core 挖出牌型分解数据，工程量接近上方 Phase 2 EV 模型的量级；且
  "对手手里的牌多久会被打出来"仍然是未建模的行为概率，即使分了渠道也还要沿用现在
  这套"均匀分布在剩余轮次里被摸到"的简化假设。**结论：不再归入"算法逻辑、不引入新
  参数"这一档，与 Phase 2 / 阻挡低价值吃碰专题候选方向②（EV 模型）合并考虑**，
  待评估是否启动时一起排期。

  **④+④-b 验证已完成（2026-08-08）：结论是两条都不加权重，且发现 isolationPotential
  可能冗余**。用诊断脚本直接对比裸 `ukeire`/`liveUkeireCount`（不经过
  `isolationPotential`）：
  - **④-b 位次差异（边张 1/9 vs 中张 3-7）：确认已被精确捕捉**——1/9 位=3 种/16 活牌，
    2/8 位=4 种/20 活牌，3~7 位（3/5/7 均测过）打平=5 种/24 活牌，完全对称单调。
    真实差异已经存在于 `tenpaiProbabilityWeight` 链路里，`isolationPotential`
    （`strategy.ts:123-149`）现在不分位次给同一个固定加成，是在已有真实信号上
    叠加了一层不精确的常数——**不需要加位次分级权重，反而应评估是否该简化/去掉
    `isolationPotential`**（留给下面"权重之外的基本逻辑缺口审计"一起考虑，不单独
    起专题）。
  - **④(a)(b) 花色集中/间距：数据不支持原假设，效应方向是反的**——测了"同花色
    gap=3"(9 种/32 活牌) vs "同花色 gap=5"(10 种/36 活牌) vs "跨花色同 rank"
    (11 种/40 活牌)：同花色小间距反而活牌数最少。原因不是 bug：`ukeire`/
    `liveUkeireCount` 统计的是"能让向听下降的不同牌种"这种广度，两个孤立牌越
    接近（尤其同花色）各自 ±2 邻域重叠越多，并集反而变小；"双向搭桥牌效率更高"
    这个真实存在的麻将常识，在这套单步广度指标里没有被建模成正向因素。**不要
    加"间距"或"同花色集中度"权重**——真要建模这个效应需要多步前瞻：优先用
    "按进张枚举 → 最佳后续弃牌 → 叶子形状质量"的轻量 2-ply 探针；叶子特征须经
    独立目标/反例 fixture 验证，完整 rollout 仅在该方案证明不足时再评估。属于已暂缓的
    Phase 2 范畴，不是简单加权重能解决的。

- 评估 Junk AI 自我优化基础设施（Feature 参数化 + 自对弈 arena + 调参脚本这套结构）是否推广到 hangzhou/bloodbattle：可复用部分是 Layer B（打分求和）/C（强度旋钮）/D（自对弈引擎+调参算法）的实现模式，玩法专属的 Feature 抽取（对应各玩法番型/规则）仍需各自单独做，不会自动免掉。
- Junk AI `handQuality` 打分两处升级已完成（`packages/ai/src/junk/strategy.ts`，`pnpm --filter @new-mj/ai verify:full` 全绿）：① `improvements` 项从"ukeire 种类数"改为"剩余活牌数求和"（新增 `liveUkeireCount`，按自己手牌/副露+全桌牌河扣减，已知缺口：不扣他家 anGang/buGang 锁死的牌，因为这些牌没经过牌河、看不到）；② 新增 `isolationPotential` 权重修复"孤立字牌不优先打出"盲点（字牌不加分，数牌按"无同花色 ±2 内邻居"给固定分，不依赖 `shanten<=1` 门槛）。上线后实战中发现 ② 引入了新回归：判断"是否有邻居"用的是弃牌之后的手牌，导致打散一个本来多余的搭子（如 5p6p 拆掉 6p）会让剩下那张牌看起来"新孤立"、反而拿到孤立分，AI 因此更愿意拆搭子也不愿打真正没用的字牌；已修（判断邻居时改用弃牌前的手牌做参照，`isolationPotential`/`handQuality` 新增 `referenceHand` 参数），并补了对应 fixture 回归测试。`isolationPotential`（初始 1.5）仍是保守起始值，没有做过定量验证——已确认自对弈胜率信噪比不够，分不出"合理 vs 更优"，后续要调这个权重应该靠场景化 fixture 测试（构造具体牌型断言推荐动作），不要跑 `tune:junk` 去微调。原 `improvementWeight` 已被 `tenpaiProbabilityWeight` 结构性取代（见下方 Junk AI Phase 1 记录），不再适用本条提醒。
- 结算展示优化（剩余）：已完成结果 panel 的赢家/和牌/番型与庄家倍率/积分阅读顺序、赢家积分置顶、“我”命名和并列操作按钮；已完成胡牌/流局大字提示（`ResultBanner.tsx`，900ms 后过渡到 panel，仅对本局实时结果播放、重连不重放）与赢家手牌胡牌张高亮（`WinningHandReveal` 新增 `winTile`，复用 `justDiscarded` 同款红环，与财神环冲突时 `cn()` 保留后者）。下一步第一个具体动作：放铳牌从牌河落入结算展示区——需要新的飞行动画（可参照 `ClaimFlipGhost.tsx`/`DiscardFlipGhost.tsx` 的 `TileFlightPortal` 模式），并先定义清楚"目标位置"具体指结算展示里的什么地方（`WinningHandReveal` 没有 `HandRow` 那种摸牌区概念，需要设计落点）。
- Junk Table UX：Replay 牌面渲染（含逐步 god 动画——阻塞点是归档只有局终 `finalState`，需要新 core 能力按步归档 god 状态或反转"replay 从不重跑 applyAction"的既有设计，属架构级决定，见 `apps/web/src/app/views/ReplayView.tsx` 顶部注释）、慢网络反馈、声明超时归零时的 `DeadlineCountdown` 行为及相应 E2E。live TableView 的 god mode（对手真实牌面+动画）已实现，见 `useTablePresentation.ts`/`TableView.tsx`。
- 评估是否以 immer 替代 ruleset 手写 `cloneState`；先验证性能不会拖慢 fuzz。
- 当第三个同构玩法出现，或下次实际改动 `hangzhou/view.ts`/`junk/view.ts` 时，评估将其约 100 行重复的 PlayerView 回放逻辑下沉到 `lib/`。
- `RoundEndOverlay`/`JunkRoundEndOverlay`/`HangzhouRoundEndOverlay` 三套件重复：动画常量、外层壳 JSX、底部按钮区（~150 行）逐字重复；提取共享 `RoundEndOverlayShell`（壳层 + 按钮区），各玩法 Overlay 只保留标题与番型详情，通过 children/render-prop 注入。三个同构玩法的触发条件已满足，下次改动这组组件时顺手做。

## 待定内容（优先级降低）

> 日麻、杭州麻将、血战到底专属工作暂缓，优先级低于垃圾胡主线；立项/排期时再评估拉回 Backlog。

- 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- 日麻立项时复审 `architecture/variant-boundary.md`。
- AI Bot：杭州与血战到底的玩法专属策略；日麻立项后再实现其策略。
