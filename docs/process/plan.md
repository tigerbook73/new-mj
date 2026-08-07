# 待完成任务与当前状态

> 本文件是待完成任务列表与当前任务状态记录，不是项目年表。只保留当前专题、其仍有参考价值的已完成前序片段、阻塞/遗留问题和有序 Backlog；专题完成后删除其状态与完成记录，将耐久结论分流到 contracts、architecture 或 variants。

## 当前任务

当前专题：无。

Junk AI 自我优化基础设施专题（强度旋钮 / 自对弈 session 驱动器 / 权重参数化 + 手写 (1+1)-ES 调参脚本）已全部完成，`pnpm --filter @new-mj/ai verify:full` 全绿，详见 `packages/ai/AGENTS.md` 与 `packages/ai/src/junk/{strategy,arena,tune,tune-cli,tune-pool,tune-worker}.ts`。后续加了两轮跟进：
- 性能：`worker_threads` 并行跑对局（`tune-pool.ts`，手写不引第三方库）+ `standardShanten` 递归 memo 跨同回合候选手牌共享 + `node --cpu-prof` profiling 定位到 `TileSet.kinds.indexOf` 线性扫描（改成 O(1) 的 `kindIndexOf`，见 `packages/core/AGENTS.md`）——同一个调参样例耗时从 80s 降到 11s（约 7x），全程报告逐字节一致、`verify:full` 含 1000+ 局 fuzz 确认无回归。
- 调参算法自己判断收敛并提前停（sigma 缩到阈值、或连续多代无变异被接受），不再需要人工猜 `--max-generations`；权重默认值从硬编码 TS 改成 `packages/ai/src/junk/default-weights.json`，`tune-cli.ts` 新增 `--write`（仍需人工显式传参，held-out 评估变差时自动跳过写入）。

后续动作转入 Backlog。

## 阻塞与遗留问题

- 疑似 bug（未复现/未定位）：庄家好像不是每局最先出牌的人。下次处理时先写最小复现用例（哪个玩法、第几局、庄家轮换是否正确）确认现象，再定位是庄家判定错了还是出牌顺序错了。

## Backlog

- 规划并实现 mobile 横屏/竖屏布局与 Expo 路线。
- 跑一次真正规模的 junk AI 调参（`pnpm tune:junk`，默认参数已经是"真跑"量级：`--max-generations 100 --min-generations 20 --seeds-per-generation 6`，会自己判断收敛提前停，不用手动猜代数；性能上比最初快约 7 倍），人工 review 报告后决定是否 `--write` 采纳候选权重（或手动改 `default-weights.json`）。
- 评估 Junk AI 自我优化基础设施（Feature 参数化 + 自对弈 arena + 调参脚本这套结构）是否推广到 hangzhou/bloodbattle：可复用部分是 Layer B（打分求和）/C（强度旋钮）/D（自对弈引擎+调参算法）的实现模式，玩法专属的 Feature 抽取（对应各玩法番型/规则）仍需各自单独做，不会自动免掉。
- Junk AI `handQuality` 打分两处升级已完成（`packages/ai/src/junk/strategy.ts`，`pnpm --filter @new-mj/ai verify:full` 全绿）：① `improvements` 项从"ukeire 种类数"改为"剩余活牌数求和"（新增 `liveUkeireCount`，按自己手牌/副露+全桌牌河扣减，已知缺口：不扣他家 anGang/buGang 锁死的牌，因为这些牌没经过牌河、看不到）；② 新增 `isolationPotential` 权重修复"孤立字牌不优先打出"盲点（字牌不加分，数牌按"无同花色 ±2 内邻居"给固定分，不依赖 `shanten<=1` 门槛）。上线后实战中发现 ② 引入了新回归：判断"是否有邻居"用的是弃牌之后的手牌，导致打散一个本来多余的搭子（如 5p6p 拆掉 6p）会让剩下那张牌看起来"新孤立"、反而拿到孤立分，AI 因此更愿意拆搭子也不愿打真正没用的字牌；已修（判断邻居时改用弃牌前的手牌做参照，`isolationPotential`/`handQuality` 新增 `referenceHand` 参数），并补了对应 fixture 回归测试。`improvementWeight`（沿用旧值 3）和 `isolationPotential`（初始 1.5）仍是保守起始值，没有做过定量验证——已确认自对弈胜率信噪比不够，分不出"合理 vs 更优"，后续要调这两个权重应该靠场景化 fixture 测试（构造具体牌型断言推荐动作），不要跑 `tune:junk` 去微调。
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
