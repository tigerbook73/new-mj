# 待完成任务与当前状态

> 本文件是待完成任务列表与当前任务状态记录，不是项目年表。只保留当前专题、其仍有参考价值的已完成前序片段、阻塞/遗留问题和有序 Backlog；专题完成后删除其状态与完成记录，将耐久结论分流到 contracts、architecture 或 variants。

## 当前任务

当前专题：Junk AI 决策质量优化，详见 `docs/process/junk-ai-decision-quality.md`
（专题推演页，按 `doc-map.md` 分流规则单独整理，避免本文件堆积）。当前进度：
验证档（④+④-b）、自摸概率修正（③）与迟疑阈值 δ 已完成；Phase 2 的轻量
2-ply 自摸诊断探针及目标/反例 fixture 已完成，但性能门槛未通过，尚未接入默认
评分。性能优化已重启：第一轮完成 34 种牌计数预计算、hand analysis 复用及
`evaluateUkeire`/`evaluateUkeireBatch` 基础 API；固定 fixture 热态约
10.1ms/探针（此前约 15.1ms），热点仍在 core `ukeire`/花色 DP，尚未达到默认
评分门槛。当前新增一项低风险准备：由每个 arena `SeatPolicy` 持有有界结构分析
LRU，每局开始清空；只缓存手牌 count signature 对应的 shanten/ukeire，不缓存牌墙、
活牌概率、安全度或趋势判断。30 个 seed 的容量曲线显示 32 条已接近饱和，默认上限
收敛为 32。50 个 seed 的阶段测量中，早/中/残局命中率约为 16.68%/18.67%/19.39%，
确认是低风险局部收益而非 10x 主路径。进一步审计显示同一次决策内重复结构 key
仅约 0.26%，主要命中来自跨决策的同局复现，因此不再增加 AI 外壳缓存。下一步第一个
具体动作：core 独立 batch 已比逐候选约快 1.7x，但接入完整 2-ply 反而慢约 9%，
因此暂不接入 AI。已完成 remove-context 的 base prefix 复用，core fixture 约提升
2.4%，且 `verify:full` 全绿；随后跳过未使用的 `baseSuffix[0]`，再取得约 4.2%，
`verify:full` 仍全绿。已完成并接受嵌套 tail 合成优化：同一个 remove context 的更早
add 花色从右向左复用嵌套 transition，减少重复 `composeTransitions` 与临时分配；
等价测试和 core `verify:full` 全绿。AI 优化尚未结束，只是从 AI 层微优化转入 core
批量算法阶段。后续按专题计划的 Phase 2 路线执行：固定完整 2-ply 基线；提 core
“弃牌候选 × 34 种摸牌”共享 DP API；用独立正确性/性能 A/B 对比逐叶分析与 batch；
先只接入诊断探针，达到完整探针基线且 checksum/叶子结果一致后，才评估默认评分准入。
若局部 batch 变快但完整 probe 变慢，继续拒绝接入；只有在仍有必要时才升级到整批结构
分析、增量活牌概率或专用 DP 查询。x10 仅是理论空间，不是承诺结果。下一步第一个
具体动作：把 core 批量 API 与性能边界提为独立架构提案；提案明确前不在 AI 层增加
缓存或评分路径。`垃圾胡性能优化讨论.md` 的进取/保守策略不纳入本阶段。

Phase 2 进入 core 批量 API 前置清理：已将 `createShantenProber` 与
`createTwoChangeShantenProber` 从 `shanten-suit-table.ts` 拆到
`packages/core/src/lib/shanten-prober.ts`，旧文件从 771 行降至 580 行；算法、表结构
和调用语义不变。core `verify:full` 全绿，2-ply checksum 不变，benchmark 约
13.28ms/probe，无性能回归证据。已评估继续拆分单花色 solver/table-builder：需要
额外引入共享索引/表类型模块，只有文件长度收益，没有明确性能或边界收益，已拒绝
继续拆分。当前清理阶段收束，已在专题文档写出 core 批量 API 提案：以标准 34 种牌
count/index 为输入，返回弃牌×摸牌叶子的向听与进张种类；不承载 TileId、活牌概率、
番型或 AI 权重。正确性要求逐叶等价，性能要求完整 probe 不慢于约 13.3–13.6ms 基线。
下一步第一个具体动作：将该 core 接口形状和性能边界提回 Claude Project 做架构确认，
确认前不实现、不导出到默认 AI 路径。

Shanten/Ukeire 共享底层重构 Phase 1 已全部完成并收档：分层设计与长期决策
沉淀至 `docs/architecture/shanten.md`，算法/存储细节在 `packages/core/src/
lib/shanten-suit-table.ts` 顶部注释，性能演进见 git history（`perf(core):`
系列 commit）。端到端自对弈耗时累计降约 11.9x，`verify:full` 全绿。后续
动作转入 Backlog。

## 阻塞与遗留问题

- 疑似 bug（未复现/未定位）：庄家好像不是每局最先出牌的人。下次处理时先写最小复现用例（哪个玩法、第几局、庄家轮换是否正确）确认现象，再定位是庄家判定错了还是出牌顺序错了。

## Backlog

- 规划并实现 mobile 横屏/竖屏布局与 Expo 路线。
- Junk AI 决策质量优化：详见 `docs/process/junk-ai-decision-quality.md`（专题推演页，
  避免本文件堆积）。
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
