# 待完成任务与当前状态

> 本文件是待完成任务列表与当前任务状态记录，不是项目年表。只保留当前专题、其仍有参考价值的已完成前序片段、阻塞/遗留问题和有序 Backlog；专题完成后删除其状态与完成记录，将耐久结论分流到 contracts、architecture 或 variants。

## 当前任务

当前专题：牌桌动画运行时收敛。

- 目标：将牌桌动画的 token、snapshot 协调、DOM 测量、portal 飞行与组件消费收敛为清晰的 feature-private runtime，保持现有视觉行为与敏感数据边界。
- 首个 slice 验收：建立 `animation/` 运行时目录与 coordinator 入口；`TableView` 只在 snapshot 落库前注册动画、挂载/换局时 reset；`useTablePresentation` 不再读取动画 singleton；既有 token、飞行与 slot-resolution 单测继续通过。
- 约束：不修改 `PlayerView`、协议、server 或玩法规则；snapshot 仍是唯一权威；动画状态不进 session store；TileId 只可进入明牌/God mode 的 DOM；跨区域移动仍由独立 ghost 完成。
- 已知未知项及最早验证：coordinator 必须保留“snapshot 注册先于 apply”的同步顺序，且 metadata 不能触发 React 状态更新；先抽纯 hand-track model 并用单测固定 token/reconnect/God-mode 边界，再迁移 coordinator 与 presentation 消费者。
- 进度：进行中。已完成合并前架构审视，并完成首个使能 slice：纯 `animation/model/handVisualTrack` 承担 known/hidden token reconciliation，原 ledger 只保留 snapshot 解包、DOM rect 捕获与 origin 缓存；model 与既有 ledger 回归均已覆盖。下一步将以 coordinator 集中 snapshot 注册和 reset。
- 下一步第一个具体动作：创建 `animation/tableAnimationCoordinator`，将 `TableView` 的 animation/hand ledger 注册与 reset 移入该单一入口，保持 apply 前同步顺序。

## 阻塞与遗留问题

- 暗杠完成后，副露区域没有显示对应的牌组；下次改动副露展示或暗杠流程时，先补复现用例并修正其 PlayerView 到 `MeldGroup` 的呈现映射。
- 胡牌展示中的牌型尚未按展示规则排序；下次改动和牌结算展示时，明确排序契约并补对应的组件用例。
- `apps/web/test/lobby.e2e-spec.ts` 中 “leaving an in-game room keeps the other human in the match” 与 “force exiting an in-game room ends the session for every player” 在完整套件中偶发超时（等待 “Hand off to AI”/“Force exit”）；单独或小范围运行稳定通过。下次改动 leave-room/force-exit 时处理。
- `apps/web/test/table.e2e-spec.ts` 中 “a claimed tile FLIPs from the discard pile into the meld via a ghost clone” 在多 worker 全量 E2E 中偶发等待 `claim-flip-ghost` 超时，单独运行稳定；下次改动动画时处理。
- 杭州规则仍有两处已实现但待产品确认的假设：财神替代数量上限，以及 `caiPiaoCount` 是否在牌局中途清零；当前按 `docs/variants/hangzhou.md` 默认值执行。

## Backlog

- 桌面牌桌：将庄家标志移到玩家名称上方并左对齐；改动 `InfoSlot` 时补组件/桌面验收，保证四个旋转座位的屏幕阅读方向不变。
- 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- 规划并实现 mobile 横屏/竖屏布局与 Expo 路线。
- 日麻立项时复审 `architecture/variant-boundary.md`。
- Junk Table UX：Replay 牌面渲染（含逐步 god 动画——阻塞点是归档只有局终 `finalState`，需要新 core 能力按步归档 god 状态或反转"replay 从不重跑 applyAction"的既有设计，属架构级决定，见 `apps/web/src/app/views/ReplayView.tsx` 顶部注释）、慢网络反馈、声明超时归零时的 `DeadlineCountdown` 行为及相应 E2E。live TableView 的 god mode（对手真实牌面+动画）已实现，见 `useTablePresentation.ts`/`TableView.tsx`。
- 评估是否以 immer 替代 ruleset 手写 `cloneState`；先验证性能不会拖慢 fuzz。
- 当第三个同构玩法出现，或下次实际改动 `hangzhou/view.ts`/`junk/view.ts` 时，评估将其约 100 行重复的 PlayerView 回放逻辑下沉到 `lib/`。
