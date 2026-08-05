# 待完成任务与当前状态

> 本文件是待完成任务列表与当前任务状态记录，不是项目年表。只保留当前专题、其仍有参考价值的已完成前序片段、阻塞/遗留问题和有序 Backlog；专题完成后删除其状态与完成记录，将耐久结论分流到 contracts、architecture 或 variants。

## 当前任务

当前专题：无。

## 阻塞与遗留问题

- `apps/web/test/lobby.e2e-spec.ts` 中 “leaving an in-game room keeps the other human in the match” 与 “force exiting an in-game room ends the session for every player”、以及 `apps/web/test/table.e2e-spec.ts` 中 “a claimed tile FLIPs from the discard pile into the meld via a ghost clone”，三处在完整套件/多 worker 全量 E2E 中偶发超时，单独或小范围运行稳定。根因已定位为同一类（暂不动手）：全量 E2E 共享单一 server 进程（内存态房间状态 + `setTimeout` 驱动 AI/超时），多 worker 并发挤占 Node 事件循环与浏览器 rAF，导致这几处依赖“定时器/动画按时完成”的固定 10s 超时偶发触发；`cdcebee`（解除主 checkout 的 `E2E_WORKERS` 上限）放大了此问题。下次处理时，第一个具体动作：把这几处断言从固定 `timeout` 改为 `expect.poll` + 更宽松阈值，并评估主 checkout 全量 E2E 是否也该保留合理 worker 上限（按 worker 隔离 server 实例成本更高，先不做）。

## Backlog

- 桌面牌桌：将庄家标志移到玩家名称上方并左对齐（玩家名称也同样左对齐），然后本玩家不在桌面显示 “我”，不显示名称；改动 `InfoSlot` 时补组件/桌面验收，保证四个旋转座位的屏幕阅读方向不变。
- 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- 规划并实现 mobile 横屏/竖屏布局与 Expo 路线。
- 日麻立项时复审 `architecture/variant-boundary.md`。
- 玩法介绍页：为每个已支持玩法提供独立介绍页；在大厅的玩法标签页旁增加对应入口链接。
- Game Lobby：新增房间创建时向大厅中的用户推送 room 新增事件，使大厅列表增量更新、不再依赖手动 refresh；这会改变当前“不做大厅列表实时推送”的协议范围，实施前先更新会话契约与验收。
- Room Page 优化：移除玩家/Bot 改用 icon “×”操作；玩家名称右对齐并按统一竖列对齐，预留移除按钮空间；Ready 改用 icon，置于玩家名称之前。
- AI Bot：建立按玩法的策略与可重复评测路线——巩固 Junk 的向听/进张/番型启发式，补杭州与血战到底的玩法专属策略；日麻立项后再实现其策略。先为“手持 4/5/6 万仍推荐吃 6 万”的建议补复现用例，审计吃牌模拟与评分是否回归并修正预期。随后再评估人机强度分级；若要拆为独立 AI 进程/服务，先作为架构级决定提交 Claude Project，重审信息边界、延迟与故障行为。
- 结算展示优化（剩余）：已完成结果 panel 的赢家/和牌/番型与庄家倍率/积分阅读顺序、赢家积分置顶、“我”命名和并列操作按钮；下一步第一个具体动作是为胡牌、流局增加短暂大字提示后再显示 panel，并处理赢家手牌高亮及放铳牌落入摸牌区。
- Junk Table UX：Replay 牌面渲染（含逐步 god 动画——阻塞点是归档只有局终 `finalState`，需要新 core 能力按步归档 god 状态或反转"replay 从不重跑 applyAction"的既有设计，属架构级决定，见 `apps/web/src/app/views/ReplayView.tsx` 顶部注释）、慢网络反馈、声明超时归零时的 `DeadlineCountdown` 行为及相应 E2E。live TableView 的 god mode（对手真实牌面+动画）已实现，见 `useTablePresentation.ts`/`TableView.tsx`。
- 评估是否以 immer 替代 ruleset 手写 `cloneState`；先验证性能不会拖慢 fuzz。
- 当第三个同构玩法出现，或下次实际改动 `hangzhou/view.ts`/`junk/view.ts` 时，评估将其约 100 行重复的 PlayerView 回放逻辑下沉到 `lib/`。
