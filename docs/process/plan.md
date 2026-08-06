# 待完成任务与当前状态

> 本文件是待完成任务列表与当前任务状态记录，不是项目年表。只保留当前专题、其仍有参考价值的已完成前序片段、阻塞/遗留问题和有序 Backlog；专题完成后删除其状态与完成记录，将耐久结论分流到 contracts、architecture 或 variants。

## 当前任务

当前专题：Junk AI 自我优化基础设施（仅限 junk）。

- **目标**：给 junk 的 AI（`packages/ai/src/junk/strategy.ts`）加上可配置强度旋钮，并建立全自动（自对弈胜率/顺位/得分统计）的评估与调参闭环，让后续启发式/权重改动能被客观验证，而不是靠人工判断牌局好坏。仅做 junk；验证成功后再决定是否推广到其他玩法。
- **首个 slice 验收**（已完成，见下）：`recommendJunkAction`/`chooseJunkAction` 新增第三个可选参数 `JunkStrengthConfig`（`temperature`/`random`），省略或 `temperature<=0` 时逐字节复现现有确定性 argmax；`temperature>0` 时按已算出的动作分数做 softmax 采样。`apps/server` 调用点零改动。
- **不可违反约束**：`ai → core` 依赖方向不可反转；不改 `apps/server` 协议/Room/UI（强度配置只服务自对弈评测内部，不做玩家可选难度）；不引入日麻宝牌/立直概念（junk 无花牌无癞子）；调参脚本产出的候选权重必须人工 review 后才能替换生产默认值，不做自动替换；若未来要把 AI 拆成独立进程/服务，先作为架构级决定提交 Claude Project。
- **已知未知项**：Slice 3 的调参脚本要不要引入第三方 CMA-ES/遗传算法库还是手写简化版——留到开工时再定。
- **进度**：
  - Slice 1（强度旋钮）已完成，`pnpm --filter @new-mj/ai verify` 全绿。
  - Slice 2（自对弈多局 session 驱动器）已完成：新增 `packages/ai/src/junk/arena.ts`（`playJunkMatch`/`strengthPolicy`，fork 自 `packages/core/src/rulesets/junk/fuzz.ts` 的 `playJunkGame`/`nextAction` 模式，复刻 `docs/contracts/session-mechanics.md` §4/§5/§8 的累分/庄家轮换/排名逻辑；`dealerStreak` 有意省略，见 arena.ts 注释）+ 冒烟测试 `packages/ai/test/junk-arena.test.ts`（30 局量级：分数守恒 + 低温强座位平均名次显著优于高温弱座位）。冒烟局数较大导致单测秒级以上，已按 `testing-strategy.md` §1.2 给 `packages/ai` 补上 slow-tag 拆分（`vitest.config.ts`、`package.json` 的 `test`/`test:full`/`verify:full` 脚本、`testing-strategy.md` §1.2 同步更新 workspace 列表）；新建 `packages/ai/AGENTS.md` 记录随机源注入约定与工具脚本边界。`pnpm --filter @new-mj/ai verify:full` 全绿（27/27，含 2 个慢速用例，共约 137s）。
  - 下一步第一个具体动作：开工 Slice 3——把 `JUNK_FAN_WEIGHTS` 和 `handQuality`/`scoreAction`/`fanPotential` 里的魔数系数抽成显式可覆盖的权重结构（`JUNK_FAN_WEIGHTS` 仍作默认导出值），再写一个手动触发、不进 `pnpm verify` 的离线调参脚本（`packages/ai/src/junk/arena/tune.ts`，用 Slice 2 的 `playJunkMatch` 做同种子对局复制对比），产出新旧权重对比报告供人工 review。

## 阻塞与遗留问题

- 疑似 bug（未复现/未定位）：庄家好像不是每局最先出牌的人。下次处理时先写最小复现用例（哪个玩法、第几局、庄家轮换是否正确）确认现象，再定位是庄家判定错了还是出牌顺序错了。

## Backlog

- 规划并实现 mobile 横屏/竖屏布局与 Expo 路线。
- AI Bot 启发式质量盲点（未修，等 Junk AI 自对弈平台落地后再验证修复效果）：孤立字牌（`z` 结尾）在 `handQuality`（`packages/ai/src/junk/strategy.ts`）里不会比孤立数牌先被打出。原因链：`standardShanten`（`packages/core/src/lib/shanten.ts` 的 `isSuit` 分支）里孤立单张无论字牌数牌都只命中"直接丢弃"分支，对打牌后的向听数贡献相同；`improvements`（ukeire 差值）只在 `shanten <= 1` 时才计算，早中盘该项恒为 0；于是多张"孤立无用单张"打分完全打平，`recommendJunkAction` 的严格比较让平局取先遍历到的那张，字牌若排在 `legalActions` 末尾就永远选不到。修法方向：给 `handQuality` 加一项不依赖 `shanten<=1` 门槛的"孤立单张潜在进张宽度"打分（字牌固定给低分，数牌按周边同花色已有牌数给分）。
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
