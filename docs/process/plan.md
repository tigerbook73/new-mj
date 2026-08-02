# 待完成任务与当前状态

> 本文件是待完成任务列表与当前任务状态记录，不是项目年表。只保留当前专题、其仍有参考价值的已完成前序片段、阻塞/遗留问题和有序 Backlog；专题完成后删除其状态与完成记录，将耐久结论分流到 contracts、architecture 或 variants。

## 当前任务

当前暂无进行中专题。最近完成：junk AI 出牌质量提升（向听数驱动规则 bot）：为 junk 新增通用向听数/进张计算和表驱动 bot 策略，RoomService 仅向真实 junk 视图分流；其他玩法保持随机 baseline。策略以向听数、临近听牌时的进张、番型潜力和公开安全牌评分；完成 `@new-mj/ai verify`、replay-get/replay-omniscient 7 条 E2E，以及 1 万局 junk fuzz。

- 下一步第一个具体动作：从 Backlog 选择下一个专题并建立其一页 brief。

## 阻塞与遗留问题

- `apps/web/test/lobby.e2e-spec.ts` 中 “leaving an in-game room keeps the other human in the match” 与 “force exiting an in-game room ends the session for every player” 在完整套件中偶发超时（等待 “Hand off to AI”/“Force exit”）；单独或小范围运行稳定通过。下次改动 leave-room/force-exit 时处理。
- `apps/web/test/table.e2e-spec.ts` 中 “a claimed tile FLIPs from the discard pile into the meld via a ghost clone” 在多 worker 全量 E2E 中偶发等待 `claim-flip-ghost` 超时，单独运行稳定；下次改动动画时处理。
- 杭州规则仍有两处已实现但待产品确认的假设：财神替代数量上限，以及 `caiPiaoCount` 是否在牌局中途清零；当前按 `docs/variants/hangzhou.md` 默认值执行。

## Backlog

- 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- 规划并实现 mobile 横屏/竖屏布局与 Expo 路线。
- 日麻立项时复审 `architecture/variant-boundary.md`。
- Junk Table UX：Replay 牌面渲染、慢网络反馈、声明超时归零时的 `DeadlineCountdown` 行为及相应 E2E。
- 评估是否以 immer 替代 ruleset 手写 `cloneState`；先验证性能不会拖慢 fuzz。
- 当第三个同构玩法出现，或下次实际改动 `hangzhou/view.ts`/`junk/view.ts` 时，评估将其约 100 行重复的 PlayerView 回放逻辑下沉到 `lib/`。
