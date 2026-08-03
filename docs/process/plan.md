# 待完成任务与当前状态

> 本文件是待完成任务列表与当前任务状态记录，不是项目年表。只保留当前专题、其仍有参考价值的已完成前序片段、阻塞/遗留问题和有序 Backlog；专题完成后删除其状态与完成记录，将耐久结论分流到 contracts、architecture 或 variants。

## 当前任务

当前专题：四方手牌重排与弃牌飞行动画。

- 目标：将手牌重排统一为按屏幕坐标计算的四座位动画；明牌精确从实际 TileId 起飞，暗牌从稳定的本地视觉槽位起飞。
- 首个 slice 验收：正常实时弃牌时，四方幸存手牌都沿正确屏幕方向补位；God mode 追踪真实明牌，普通对手手牌不暴露 TileId；重连与减少动态效果不补播。
- 约束：不修改 `PlayerView`、协议或玩法规则；snapshot 仍是唯一权威；跨区域移动仍由独立 ghost 完成；docs 先于代码；不合并本分支。
- 已知未知项及最早验证：四分之一旋转的 DOM rect 到局部位移换算须由纯单测覆盖；先完成 token/几何模块和四座位组件测试，再跑桌面 E2E 观察实际轨迹。
- 进度：已完成。四方手牌均通过 ScreenReflow 在独立 wrapper 上按屏幕 rect 的逆旋转差值补位；明牌按 TileId、暗牌按稳定 back-slot token 追踪。弃牌源在 snapshot 提交前捕获，暗牌从选中牌背起飞并在途中翻面；普通手牌与固定摸牌槽现共用 `HandTileSlot` 的满高居中和牌尺寸锚点，仅摸牌附加 ghost/ledger，避免基线漂移。reduced motion、重连和非实时快照不补播。Web 单测、定向桌面 E2E、typecheck、lint 与 `pnpm verify` 均通过。
- 下一步第一个具体动作：复查左家暗牌弃牌的源盒插值；最新修正通过 typecheck/lint，定向桌面 E2E 的其余 5 项通过，但已知 `claim-flip-ghost` 偶发超时再次出现，尚待独立复跑后再推送；不合并。

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
