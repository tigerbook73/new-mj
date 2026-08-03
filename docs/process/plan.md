# 待完成任务与当前状态

> 本文件是待完成任务列表与当前任务状态记录，不是项目年表。只保留当前专题、其仍有参考价值的已完成前序片段、阻塞/遗留问题和有序 Backlog；专题完成后删除其状态与完成记录，将耐久结论分流到 contracts、architecture 或 variants。

## 当前任务

当前专题：无。

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
- 玩法介绍页：为每个已支持玩法提供独立介绍页；在大厅的玩法标签页旁增加对应入口链接。
- Game Lobby：新增房间创建时向大厅中的用户推送 room 新增事件，使大厅列表增量更新、不再依赖手动 refresh；这会改变当前“不做大厅列表实时推送”的协议范围，实施前先更新会话契约与验收。
- Room Page 优化：移除玩家/Bot 改用 icon “×”操作；玩家名称右对齐并按统一竖列对齐，预留移除按钮空间；Ready 改用 icon，置于玩家名称之前。
- AI Bot：建立按玩法的策略与可重复评测路线——巩固 Junk 的向听/进张/番型启发式，补杭州与血战到底的玩法专属策略；日麻立项后再实现其策略。随后再评估人机强度分级；若要拆为独立 AI 进程/服务，先作为架构级决定提交 Claude Project，重审信息边界、延迟与故障行为。
- 结算展示优化：胡牌时先展示赢家大字提示，再延时显示结果 panel；赢家手牌全部明示并高亮，放铳牌置入赢家的摸牌区并明示。流局时同样先短暂展示“流局”大字，再显示结果 panel。
- Junk Table UX：Replay 牌面渲染（含逐步 god 动画——阻塞点是归档只有局终 `finalState`，需要新 core 能力按步归档 god 状态或反转"replay 从不重跑 applyAction"的既有设计，属架构级决定，见 `apps/web/src/app/views/ReplayView.tsx` 顶部注释）、慢网络反馈、声明超时归零时的 `DeadlineCountdown` 行为及相应 E2E。live TableView 的 god mode（对手真实牌面+动画）已实现，见 `useTablePresentation.ts`/`TableView.tsx`。
- 评估是否以 immer 替代 ruleset 手写 `cloneState`；先验证性能不会拖慢 fuzz。
- 当第三个同构玩法出现，或下次实际改动 `hangzhou/view.ts`/`junk/view.ts` 时，评估将其约 100 行重复的 PlayerView 回放逻辑下沉到 `lib/`。
