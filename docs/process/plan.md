# 待完成任务与当前状态

> 本文件是待完成任务列表与当前任务状态记录，不是项目年表。只保留当前专题、其仍有参考价值的已完成前序片段、阻塞/遗留问题和有序 Backlog；专题完成后删除其状态与完成记录，将耐久结论分流到 contracts、architecture 或 variants。

## 当前任务

当前专题：修复 Junk v3 PR review。

- 进度：Junk 终局结果保留兼容的数字 `winners`，并新增可重连结算快照 `winnerDetails`（seat、fanTypes、multiplier、payout）；Web 结算面板改读详情，番型 id 已与 scorer 对齐。AI 已移除旧 config 依赖，七小对与抢杠按固定规则评估。第二轮 review 修复：首局 seed 随机庄家现在在首局快照前广播 `room:dealerChanged`（此前 web 皇冠标记整局指向过期的座位 0）；`fanTypes` 收窄为 `JunkFanType` 字面量联合；junk 迁移到 `lib/gang-chain.ts`（hangzhou/junk 类型统一）；web fixture 改用 scorer 真实可产生的番型组合（删除不存在的 `dealer` 番型标签）；AI 七对测试改为有判别力的分差断言；rebind e2e 不再假设庄家=座位 0（消除随机庄家引入的 ~25% flake）。四包 verify 全绿。
- 追加：Vitest 慢速用例分层落地——core 6 个 fuzz/property 冒烟用例打一等 `slow` test tag（Vitest 4.1 `test.tags`，timeout 由 tag 统一提供），`test` 以 `--tags-filter '!slow'` 排除（core 单测 48s→1.5s），`test:full` 全量；各 workspace 统一提供 `test:full`（无慢速用例的做别名），根 `verify:full` 改用 `test:full`；docs（testing-strategy §1.2、workflow、双 AGENTS.md）同 commit 更新。
- 下一步第一个具体动作：commit 并推送本次 review 修复 + 慢速测试分层至 PR #6，等待下一轮 review。

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
