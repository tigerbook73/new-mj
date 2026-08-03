# 待完成任务与当前状态

> 本文件是待完成任务列表与当前任务状态记录，不是项目年表。只保留当前专题、其仍有参考价值的已完成前序片段、阻塞/遗留问题和有序 Backlog；专题完成后删除其状态与完成记录，将耐久结论分流到 contracts、architecture 或 variants。

## 当前任务

当前专题：开发态同步明牌快照。

- 目标：在 server 的开发/测试明牌开关开启时，将与 `PlayerView` 同 seq 的对手手牌和暗杠数据随 `game:snapshot`、`room:enter` 一起单播；Web 的 God mode 只切换显示，不再异步查询造成抓牌闪烁。
- 首个 slice 验收：`GameSnapshot` 与中局 `room:enter` 在门控开启时携带可选 `debugOmniscient`（仅 hands/melds），关闭或生产环境时严格省略；Web 以同一快照原子采用该数据。
- 约束：不修改 `PlayerView` 或玩法规则；隐藏 TileId 不进入 `game:event`；仅开发/测试、仅已入座连接；docs 先于代码；不合并本分支。
- 已知未知项及最早验证：现有 reconnect ack 只返回 `view`，需复用同一权威 state 派生 debug 数据；先以 protocol/server 单测覆盖门控和同 seq，再补 Web store/presentation 回归。
- 进度：已完成。`GameSnapshot`、中局 `room:enter` 与 RoomService snapshot event 都支持可选 `debugOmniscient`；server 从同一权威 state 同步派生一次并在非生产 `ALLOW_DEBUG_OMNISCIENT=true` 时单播，生产环境强制省略。Web 将该字段与 `view` 原子存入 session，God mode 仅切换渲染来源，删除了逐 snapshot 的异步 `debug:omniscientView` 查询。protocol/server/web 回归测试覆盖契约、生产门控、实时快照、room:enter 解包与陈旧快照拒绝；`pnpm verify` 的 typecheck/lint/build/unit 阶段通过，server E2E 5 套通过、Web E2E 38/38 通过。
- 下一步第一个具体动作：将 `feat/debug-omniscient-snapshots` 提交并推送，等待 review；不合并。

## 阻塞与遗留问题

- `apps/web/test/lobby.e2e-spec.ts` 中 “leaving an in-game room keeps the other human in the match” 与 “force exiting an in-game room ends the session for every player” 在完整套件中偶发超时（等待 “Hand off to AI”/“Force exit”）；单独或小范围运行稳定通过。下次改动 leave-room/force-exit 时处理。
- `apps/web/test/table.e2e-spec.ts` 中 “a claimed tile FLIPs from the discard pile into the meld via a ghost clone” 在多 worker 全量 E2E 中偶发等待 `claim-flip-ghost` 超时，单独运行稳定；下次改动动画时处理。
- 杭州规则仍有两处已实现但待产品确认的假设：财神替代数量上限，以及 `caiPiaoCount` 是否在牌局中途清零；当前按 `docs/variants/hangzhou.md` 默认值执行。

## Backlog

- 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- 规划并实现 mobile 横屏/竖屏布局与 Expo 路线。
- 日麻立项时复审 `architecture/variant-boundary.md`。
- Junk Table UX：Replay 牌面渲染（含逐步 god 动画——阻塞点是归档只有局终 `finalState`，需要新 core 能力按步归档 god 状态或反转"replay 从不重跑 applyAction"的既有设计，属架构级决定，见 `apps/web/src/app/views/ReplayView.tsx` 顶部注释）、慢网络反馈、声明超时归零时的 `DeadlineCountdown` 行为及相应 E2E。live TableView 的 god mode（对手真实牌面+动画）已实现，见 `useTablePresentation.ts`/`TableView.tsx`。
- 评估是否以 immer 替代 ruleset 手写 `cloneState`；先验证性能不会拖慢 fuzz。
- 当第三个同构玩法出现，或下次实际改动 `hangzhou/view.ts`/`junk/view.ts` 时，评估将其约 100 行重复的 PlayerView 回放逻辑下沉到 `lib/`。
