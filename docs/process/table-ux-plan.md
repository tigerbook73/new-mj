# Junk Table UX 分阶段实施计划

> 状态：Phase 3 已本地 squash merge；Phase 4 改为独立 branch 的逐场景检查点，P4.1 桌面横屏、手牌排序与 Storybook 隔离验收工具已实现，等待用户逐组件验收。
>
> 本文件保存专题设计、阶段依赖、阶段细化内容与验收记录；`plan.md` 只保留总进度、当前阶段和下一步第一个动作。

## 1. 目标与边界

本专题把垃圾胡 Table 打磨成完整产品体验：桌面与手机 Web 全屏无页面滚动、核心对局内容不裁切、合法动作完整可操作、AI 给出一个合法推荐、server 提供可配置声明超时、客户端按权威快照同步并播放事件动画，同时把现代麻将桌视觉系统推广到其他 Web 页面。

边界：

- 只完整验收垃圾胡；bloodbattle 只保证公共骨架不回归，换三张/定缺等进入总待办。
- UI 延续现有英文，本专题不做国际化。
- AI 第一版只推荐一个合法动作，不承诺向听、牌效分数或解释。
- 声明窗口与普通摸打回合使用独立 server timer；普通回合的 10 秒自动出牌在 Phase 5 落地。
- 本轮不加入音效。

## 2. 阶段工作流

本专题经用户明确确认，临时覆盖 `workflow.md` 的 trunk-based 默认方式：

1. 每个 Phase 必须从最新本地 `main` 创建下表指定的独立 branch；前一 Phase 未合并不得开始后一 Phase。Phase 4 进一步按 P4.1–P4.5 使用独立 branch，每个子阶段都从已合并前一子阶段的最新 `main` 创建，不能在同一长驻 branch 连续开发。
2. 开工先读 `plan.md` 状态区，再只细化当前 Phase 的实现清单、接口、风险和验收。详细计划完成后更新两份 tracker、形成规划检查点提交并强制暂停；**只有用户明确确认该 Phase 计划后才能开始测试和实现**。
3. 若细化时出现新的架构级选择，同样暂停并提请用户决定，不能用规划检查点绕过架构护栏。
4. 获得计划确认后，实现与测试同阶段完成；先跑定向检查，阶段门统一执行根目录 `pnpm verify`。
5. 收工时更新本文件与 `plan.md`，记录验证结果和下一步首个动作，然后允许自动提交。
6. 实现提交后必须停止并报告 branch、commit、验证结果和风险；**不得自动 merge、不得创建 PR、不得自动推送**。
7. 只有用户明确要求 merge 后，才在本地把该 branch squash merge 到 `main`；成功后把最终 `Merge commit` 写入该 Phase 的固定字段并形成 tracker 提交，随后可删除本地阶段分支。下一 Phase 再从新的 `main` 开始，并重新经过“详细计划→用户确认”门。

状态约定：`[ ] pending`、`[~] in progress`、`[x] completed`、`[!] blocked`。

## 3. 公共接口决策

### 3.1 AI advice

- 新增查询 `game:advice {}`。
- ack data：`{ seq: number, deadline?: number, actions: unknown[], recommendedActionIndex?: number }`。
- server 只根据握手绑定座位取得 `PlayerView + getLegalActions`，再调用 `packages/ai`；payload 不包含也不信任 userId/seat。
- `packages/ai` 新增 `recommendAction(playerView, legalActions)`；推荐必须来自 legalActions，只消费该座位可见信息。现有 bot 自动出牌策略保持独立。
- web 只接受与当前 seq 匹配的 advice；动作数组由 core 决定合法性，web 只分组、展示和提交。

### 3.2 权威快照与动画

- `game:snapshot` 保持 `{ view, seq, deadline? }` 形状，扩展语义为每个真人、bot 或超时代提交动作后的逐座位权威状态。
- 同一连接按“可见 game events → 覆盖这些 events 的 snapshot”发送。
- event 只驱动动画；snapshot 始终是最终状态权威。重连直接采用最新 snapshot，不重播历史动画。
- Phase 6 使用双状态与动画屏障：新 snapshot 立即进入 `authoritativeSnapshot`，但只有对应 event 动画完成后才提交为 Table 渲染和可操作性所读的 `presentedView`；可选动作、AI 建议和按钮不得直接读取尚未呈现的权威状态。
- 动画期间锁定操作并按 seq 排队；重连、页面恢复、队列过长或 reduced-motion 时允许跳过动画，直接把最新权威 snapshot 提交到 `presentedView`。

### 3.3 可配置声明超时

- `ConfigService.claimTimeoutMs` 读取 `CLAIM_TIMEOUT_MS`，默认 `5000` 毫秒。
- 只接受正整数；缺失、空值、非数字、零或负数回退默认值。
- 调试可设很长，例如 `CLAIM_TIMEOUT_MS=3600000`；测试可设很短。
- server 计算绝对 deadline，客户端只展示，不在本地计时结束时自行提交动作。
- 玩家响应、窗口解决、牌局结束、房间关闭或新窗口替换旧窗口时必须清理定时器；到期通过正常动作路径提交 `{ type: "pass" }`。

## 4. Phases

### [x] Phase 0 — 计划文档重置

Branch：`docs/table-ux-plan-reset`

Merge commit：`a1500a1`

完成内容：

- 新建本专题计划，固定阶段、公共接口、验收门和本地 squash 工作流。
- 重写总 plan：合并已完成能力，移除旧阶段编号和修复流水账，把 bloodbattle/mobile 等转入待办。
- 删除已完成的 `auth-session-profile-fix-plan.md`，D28 耐久结论继续由现有 contracts/decisions 承载。

阶段验收（2026-07-19）：

- `git diff --check`：通过。
- `pnpm exec prettier --check docs/process/plan.md docs/process/table-ux-plan.md`：通过。
- D28 吸纳审计：断线宽限、账号仲裁与 server-truth 恢复均已由 `contracts/session-mechanics.md` 和 `decisions.md` D25–D28 承载，无残留旧计划引用。
- `pnpm verify`：通过；format/typecheck/lint/build/unit/e2e 全绿，web Playwright 24 条、server e2e 21 条通过，core 包含 1000 局 junk 与 10000 局 bloodbattle fuzz。

### [x] Phase 1 — 权威逐动作快照

Branch：`feat/table-authoritative-snapshots`

Merge commit：`18416f9`

目标：

- 更新协议/会话契约，server 每个已接受动作后为仍连接的座位生成 PlayerView 与 seq 并单播 snapshot。
- web store 保存 seq，只接受不旧于当前状态的 snapshot。
- 移除 web 对规则型事件的状态推导；保留事件作为下一阶段动画输入。
- 覆盖多事件动作、bot 连续动作、重连和旧 snapshot 丢弃。

开工前细化重点：snapshot 生成时点、bot 链的逐步发送顺序、局终/切局的重复快照边界，以及 store 中 event/snapshot 暂存形状。

本阶段实施清单（2026-07-19 已细化）：

1. **发送时点**：`runAction` 先按现有 visibility 顺序发布该动作全部 `game:event`，再基于动作后的同一 `gameState` 给四个座位生成 snapshot；每次 bot 动作也走同一个 `runAction`，所以 bot 链天然逐步发送，不能在整条链结束后只发最后状态。
2. **局终顺序**：结束一局的动作固定为“终局 events → 终局 snapshot → `room:scoreUpdated`/`room:sessionFinished`”；若会话继续，则再发 `room:dealerChanged`，最后发下一局初始 snapshot。这样 Phase 6 能动画化终局事件，同时下一局仍从独立权威快照开始。
3. **单局 seq**：core seq 每局从头开始，不把它误当会话全局序号。web store 保存 `gameSeq`；同局只接受 `seq >= gameSeq`（相等也接受，因为一次声明响应可能改变本人视角而不要求全局 seq 增长）。`room:dealerChanged` 或切换 room/gameNumber 时清空 seq epoch，再接收下一局 snapshot。
4. **统一入口**：web 新增 `applyGameSnapshot({view, seq})`，Lobby 初始开局、Table 实时 snapshot、`room:enter` 重连 ack 全部走这一入口；`unwrapRoomEnterAck` 不再丢弃 seq。
5. **事件职责**：Table 本阶段只保留事件日志，不再用 `TurnStarted`/`TileDiscarded`/`ClaimWindowOpened`/`ClaimWindowResolved` 局部修改 view；Phase 6 再把原始事件接入非权威动画队列。
6. **房间同步**：Table 接收 `room:scoreUpdated`/`room:dealerChanged` 更新 room 元数据；离房、被踢、sign out 时同时清空 view 与 gameSeq，避免下一房间继承旧牌桌。

阶段验证：

- RoomService 单测验证每个动作 events 在前、四座 snapshot 在后，四份 view 各自对应 seat 且 seq 一致。
- gateway e2e 验证真实 socket 的动作 ack 不带状态、所有连接收到 snapshot，并保持 event→snapshot 顺序。
- web store 单测验证初始/同 seq/更高 seq 接受、旧 seq 丢弃、下一局 epoch 重置和离房清理。
- 现有 Table e2e 继续证明点击出牌后依靠 snapshot 更新手牌与牌河。
- 根目录 `pnpm verify` 全绿后回填结果并提交，停在 Phase 1 branch 等待用户 merge 指令。

完成内容：

- RoomService 的每个真人、bot 动作固定先发布可见 events，再基于同一动作后状态逐座位发布权威 snapshot；终局 snapshot 先于比分/会话事件，续局顺序修正为 dealerChanged 后发布下一局初始 snapshot。
- Web 新增单局 `gameSeq` 和统一 `applyGameSnapshot` 入口，Lobby、Table、重连 ack 都保留并使用 seq；旧 snapshot 被丢弃，相同 seq 可覆盖，切局重置 epoch，离房/断线/sign out 清空状态。
- Table 不再解释 game events 来修改 PlayerView，只保留日志；同步接收 score/dealer 房间元数据。动画与可选动作的双状态屏障已明确写入 Phase 6。
- 协议、会话契约和 Web package 约束已同步更新。

阶段验收（2026-07-19）：

- RoomService 定向单测：55 条通过，覆盖 event→四座同 seq snapshot。
- RoomsGateway 真实 Socket.IO 定向 e2e：8 条通过，覆盖 action ack 仅回执、四连接 event→snapshot 顺序。
- Web Vitest：13 条通过，覆盖 snapshot 初始/相同/更高/旧 seq、切局/切房 epoch、离房清理及重连 seq 保留。
- 根目录 `pnpm verify`：通过；format/typecheck/lint/build/unit/e2e 全绿，web Playwright 24 条、server e2e 21 条通过，core 包含 1000 局 junk 与 10000 局 bloodbattle fuzz。

### [x] Phase 2 — 可配置声明窗口超时

Branch：`feat/table-claim-timeout`

Merge commit：`39f93b2`

目标：

- 实现 `CLAIM_TIMEOUT_MS` 解析、声明窗口 deadline、每座位响应 timer 与可靠清理。
- deadline 随对应座位的 event/snapshot 发送；超时 pass 走与主动 pass 相同的 RoomService 路径。
- 使用 fake timers 覆盖主动响应、部分响应、多玩家同时到期、窗口提前解决、房间关闭与重复 timer 防护。

本阶段实施清单（2026-07-19 已细化）：

1. **配置契约**：`ConfigService.claimTimeoutMs` 读取 `CLAIM_TIMEOUT_MS`，未设置、空字符串、非有限数字、非整数、零或负数统一回退 `5000`；合法正整数不设人为上限，因此调试可用 `3600000`。`.env.example` 增加说明，真实 `.env` 不由本阶段改写。
2. **跨玩法识别**：RoomService 不读取玩法私有 state 或事件 payload 来判断窗口，只逐座位调用 `getLegalActions`；某座位当前合法动作中存在结构为 `{type:"pass"}` 的动作才创建声明 timer。因而 bloodbattle 的强制胡等不存在合法 pass 的窗口不会被错误超时。
3. **timer 所有权**：timer 只存在于 RoomService 的 `Map<roomId:seat, {deadline,timer}>`，不进入 `Room`、core state 或 PlayerView，且对 bot/永久托管座位不创建（它们继续立即走 autoPlayBots）。timer 调用 `unref()`，不阻止进程退出。
4. **同窗不续期**：每次动作后重新核对所有座位；仍有合法 pass 且已有 timer 的座位保留原 deadline，只为新出现的响应者建 timer；已响应或窗口解决的座位立即清理。这样一人先响应不会延长其他人的思考时间。
5. **超时动作路径**：回调携带预期 deadline，执行前确认 map 条目仍相同、room 仍在进行且该座位仍可合法 pass；随后删除自身 timer，通过与真人/bot 相同的 `runAction({type:"pass"})` 路径产生 events/snapshots，再运行 autoPlayBots。已清理但排队中的旧回调必须无操作返回。
6. **发送语义**：动作应用成功后先协调 timers/deadlines，再发送 Phase 1 的 events→snapshots。同一 seat 当前 deadline 同时附在其可见 `game:event` 和 `game:snapshot` envelope；无 deadline 时省略字段。EventBus 可携带 server-internal 的逐座位 deadline 映射，gateway 只投影本连接座位的值，不理解规则。
7. **重连与 Web 状态**：`room:enter` 的中局 `{room,view,seq}` 响应扩为可选 `deadline`，取该座位既有绝对截止时间，不重置 timer。Web `applyGameSnapshot` 同步保存 `gameDeadline`，旧 seq snapshot 连同 deadline 一起丢弃；相同/更新 seq 可覆盖或清除 deadline，切局、切房、离房、断线和 sign out 清空。Phase 2 不显示倒计时，Phase 5 只消费这里保存的绝对时间。
8. **生命周期清理**：新局初始化、窗口解决、局终、session 结束、房间关闭/删除以及座位转为永久托管时清理对应 timer；统一 helper 必须可重复调用，避免重复 clear 或跨局旧 callback 提交 pass。

阶段验证：

- ConfigService 单测覆盖默认 `5000`、合法短值、`3600000` 长调试值，以及空/NaN/Infinity/小数/零/负数回退，并在每例后恢复环境变量。
- RoomService fake-timer 单测覆盖：只给可 pass 的真人建 timer；主动 pass 清自身但不延长他人 deadline；部分响应后剩余玩家到期；同一时刻多人到期串行走正常动作；窗口提前解决、新局、永久托管和房间关闭均清理；陈旧 callback 不产生重复事件。
- gateway 真实 Socket.IO e2e 覆盖逐座位 deadline 隔离、event→snapshot 顺序、`game:action` ack 仍为空回执，以及重连取得同一绝对 deadline。
- Web store 单测覆盖 deadline 的接受、同 seq 更新/清除、旧 seq 丢弃和各类 reset。
- 定向检查通过后执行根目录 `pnpm verify`，回填结果并提交，停在 Phase 2 branch 等待用户 merge 指令。

完成内容：

- 新增 `CLAIM_TIMEOUT_MS` 配置，默认 5000ms，接受任意正整数长调试值；示例环境文件与配置测试同步完成。
- RoomService 仅从 `getLegalActions` 的合法 pass 识别声明窗口，为真人座位维护不续期的绝对 deadline；超时通过正常 `runAction({type:"pass"})` 路径处理，bot/永久托管继续即时行动。
- deadline 按座位附加到可见 event、权威 snapshot 和重连响应；gateway 只做座位投影，不读取规则。新局、终局、房间关闭和永久托管路径统一清理 timer。
- Web store 保存 `gameDeadline`，与 snapshot seq 一起接受或丢弃，并在切局、切房、离房、断线和 sign out 时清空；本阶段不展示倒计时。
- 阶段工作流新增固定 `Merge commit` 字段；Phase 0/1 已回填，Phase 2 在实际合并后回填。

阶段验收（2026-07-19）：

- ConfigService/RoomService 定向 Jest：66 条通过，覆盖默认/短值/长调试值/非法配置、逐座位 deadline、超时 pass、部分响应不续期及重连沿用 deadline。
- RoomsGateway 真实 Socket.IO 定向 e2e：8 条通过，覆盖 deadline 座位隔离及 event→snapshot 一致性。
- Web Vitest：14 条通过，覆盖 deadline 接受、同 seq 清除、旧 seq 丢弃和状态 reset。
- 根目录 `pnpm verify`：通过；format/typecheck/lint/build/unit/e2e 全绿，web Playwright 24 条、server e2e 21 条通过，core 包含 1000 局 junk 与 10000 局 bloodbattle fuzz。

### [x] Phase 3 — AI Advice 数据链路

Branch：`feat/table-ai-advice`

Merge commit：`9a5d254`

目标：

- 实现 `packages/ai` 的可见信息推荐入口和 `game:advice` schema/handler/service。
- web 完成 advice 获取、缓存和按 seq/deadline 失效；本阶段不重做操作 UI。
- 覆盖空动作、推荐合法性、胡/自摸优先、身份隔离、隐藏信息与 stale response。

本阶段实施清单（2026-07-19 已细化）：

1. **协议形状**：protocol 新增严格空对象请求 `GameAdviceRequestSchema` 和响应 `{seq, deadline?, actions: unknown[], recommendedActionIndex?}` schema/type；`recommendedActionIndex` 必须是 actions 的有效下标或省略，查询错误继续使用现有通用错误码。
2. **AI API**：`packages/ai` 新增泛型 `recommendAction(playerView, legalActions)`，空数组返回 `undefined`，有胡/自摸时优先返回该动作，否则确定性返回第一项。函数返回的对象必须直接来自输入 legalActions，不生成或改写动作；第一版可不使用 view 的具体字段，但保留只消费可见视图的接口边界。现有 bot `chooseAction` 及随机策略不改变。
3. **server 查询**：RoomService 新增只读 `getAdvice(roomId, seat)`：从当前 `gameState` 分别取得该 seat 的 PlayerView、legalActions、单局 seq 和既有 deadline，再调用 `recommendAction` 并用引用位置生成 index；不得推进状态、创建/续期 timer 或发布事件。
4. **身份与可见性**：gateway 的 `game:advice {}` 只用握手后的 ConnectionRegistry 得到 room/seat，不接受 userId/seat；未入座、未开局沿用 `NOT_IN_ROOM`/`GAME_NOT_STARTED`。响应只含该 seat 的 PlayerView 可推导输入与合法动作，不暴露 gameState、牌墙或他人手牌。
5. **Web 缓存**：session store 新增 advice 状态及 snapshot revision。Table 每次接受新 snapshot 后发起 advice 查询；只在响应的 `seq`、规范化 deadline 和发起时 revision 仍与当前 snapshot 完全一致时写入，否则静默丢弃。新 snapshot、切局/切房、离房、断线和 sign out 先清旧 advice。
6. **本阶段 UI 边界**：Table 不渲染推荐高亮或新按钮；Phase 5 的操作 Dock 才消费缓存。查询失败只清当前 advice，不覆盖牌桌错误区，也不因自动重试形成请求循环。

阶段验证：

- AI 单测覆盖空数组、胡/自摸优先、无胡时确定性第一项、返回值属于原 legalActions，且输入 view/action 不被修改。
- protocol 单测覆盖严格空请求、完整/空响应和非法推荐下标；若 schema 无法表达“下标小于数组长度”，由 server/consumer 单测补该关联约束。
- RoomService 单测覆盖只读性、seq/deadline 透传、推荐 index 合法、只传 PlayerView 给 AI；gateway 真实 Socket.IO e2e 覆盖 ack 查询、握手座位隔离、伪造 payload 被拒和命令/事件状态不受影响。
- Web store/Vitest 覆盖 exact seq+deadline+revision 接受，以及 stale seq、deadline 改变、同 seq 新 revision、离房/断线清理；现有 Table e2e 不要求出现推荐 UI。
- 定向检查通过后执行根目录 `pnpm verify`，回填结果并提交，停在 Phase 3 branch 等待用户 merge 指令。

完成内容：

- protocol 新增严格空请求与带关联下标校验的 `GameAdviceResponse`；gateway 的 `game:advice` 只从握手连接定位 room/seat，伪造 seat payload 被拒。
- `packages/ai.recommendAction` 空动作不推荐，优先 hu/zimo，否则确定性推荐第一项；普通回合因此会推荐一个合法 discard，且返回值始终引用原 legalActions。
- RoomService advice 查询只读取该座位 PlayerView、legalActions、seq 和既有 deadline，不推进状态、不更新 timer、不广播事件。
- Web 每次接受 snapshot 都增加 revision、清旧 advice 并重新查询；只有 seq、deadline、revision 全匹配才缓存，session/room reset 同步失效。本阶段没有新增推荐 UI。
- protocol/session 契约与 server/web package 约束已同步更新。

阶段验收（2026-07-19）：

- AI Vitest：9 条通过；protocol Vitest：36 条通过；RoomService 定向 Jest：59 条通过；Web Vitest：15 条通过。
- RoomsGateway 真实 Socket.IO 定向 e2e：8 条通过，覆盖各握手座位自己的 legalActions、合法推荐下标和伪造 payload 拒绝。
- 根目录 `pnpm verify`：通过；format/typecheck/lint/build/unit/e2e 全绿，web Playwright 24 条、server e2e 21 条通过，core 包含 1000 局 junk 与 10000 局 bloodbattle fuzz。

### [~] Phase 4 — 视觉基础与响应式 Table 骨架（P4.1 待验收）

Phase 4 子阶段分支与 merge 记录：

| 子阶段            | Branch                         | Merge commit |
| ----------------- | ------------------------------ | ------------ |
| P4.1 桌面横屏     | `feat/table-layout-desktop`    | 待合并       |
| P4.2 手机横屏     | `feat/table-layout-landscape`  | 待合并       |
| P4.3 手机竖屏     | `feat/table-layout-portrait`   | 待合并       |
| P4.4 视觉与覆盖层 | `feat/table-visual-chrome`     | 待合并       |
| P4.5 综合视口回归 | `test/table-layout-regression` | 待合并       |

Merge commit：见上方子阶段表；P4.5 合并后 Phase 4 完成

阶段总目标：

- 建立翡翠绿、暖金和深色中性 chrome 的现代麻将桌 token。
- Table 使用 `100dvh`、safe-area 与 `overflow-hidden`；桌面核心与自己的手牌/操作区分别受可用空间约束，不把整个界面强制缩成正方形。
- 核心区域完整展示四家玩家、手牌/数量、牌墙、副露、弃牌、局数/庄家、当前行动者、剩余牌和连接/AI 状态。
- 手牌按麻将牌面顺序稳定排序后展示（万→筒→条→字牌，各组内从小到大）；只排序渲染副本，不修改 PlayerView.hand，点击/提交继续使用原 TileId。
- 离桌、设置、事件日志、dev debug 放入浮层/抽屉；结算改为正式结果面板。
- 依次覆盖 1440×900、1366×768、844×390 与 390×844，无页面滚动和核心内容裁切。

逐步确认方式：

1. **P4.1 桌面横屏**：先建立 1440×900 与 1366×768 的标准桌面拓扑和组件边界；实现、自动验证后暂停，由用户实际查看并调整。
2. **P4.2 手机横屏**：P4.1 确认后才制定详细计划；保留四家方位，按高度约束桌面核心，利用左右余量承载紧凑信息。
3. **P4.3 手机竖屏**：P4.2 确认后才制定详细计划；使用“桌面核心 + 独立玩家操作台”，自己的手牌不随中央区域同比缩小。
4. **P4.4 视觉与覆盖层**：三种布局确认后才制定详细计划；统一 table token、菜单抽屉、离桌确认和结算面板。
5. **P4.5 综合视口回归**：最后制定详细计划；完成全部目标视口、主题和公共流程回归。

每个小步骤都遵循“从最新 `main` 创建独立 branch → 详细计划提交 → 用户确认 → 实现与定向验证提交 → 用户验收 → 本地 squash merge → 回填该子阶段 Merge commit”的暂停门；P4.1 未合并前不创建或细化 P4.2。Phase 4 全部小步骤通过后才执行阶段级根目录 `pnpm verify` 并关闭整个 Phase 4。

#### P4.1 — 桌面横屏标准布局（详细计划）

目标视口：1440×900、1366×768。只处理桌面横屏，不加入手机媒体查询、不实现最终视觉换肤、菜单抽屉或结算面板；按用户验收反馈，本步骤同时完成手牌显示排序。

实施清单：

1. **先固定验收边界**：扩展真实 Junk 对局 Playwright，在两个桌面视口断言 document 无水平/垂直滚动，牌桌舞台完整位于 viewport，四个玩家 badge、自己的手牌、四家牌河/副露容器及中央状态均可见。测试先失败，再实施布局。
2. **全屏页面骨架**：live Table 使用 `100dvh`、`w-full`、safe-area 和 `overflow-hidden`，形成紧凑顶栏与 `minmax(0,1fr)` 主舞台；等待数据和永久托管提示沿用同一壳。P4.1 仍保留现有全局 Sign out、日志/debug 和结果内容，但把它们收敛进不撑开页面的临时 overlay/折叠容器，正式抽屉留 P4.4。
3. **桌面拓扑**：主舞台由中央桌面核心和底部自己的手牌轨道组成，而不是把整个页面视为一个正方形。中央核心保持四家物理方位：自己下、对家上、其余左右；PlayerBadge、手牌/牌背、牌墙、牌河、副露和中央状态按外到内分层。
4. **宽高共同约束**：新增舞台测量容器，分别记录可用宽高；桌面核心尺寸取两者可容纳值，自己的手牌轨道拥有独立高度。`tileUnit` 根据核心尺寸计算，不再只读取容器宽度；移除 `min-w-[320px]` 等会制造页面溢出的下限。
5. **信息层级**：顶栏显示房间、局数/总局数、庄家和分数摘要；中央只显示当前行动者、剩余牌、阶段及现有最小 claim 操作。四个 badge 明确庄家、当前行动者、本人和 bot/断线/托管状态。本步骤不改变动作提交、Advice、协议或 core。
6. **组件切分**：从 `TableView` 提取桌面专属 `TableHud`、`TableBoard`、`CenterStatus` 等编排组件到 `components/mahjong/`；socket 订阅和业务状态仍留在 `TableView`，不修改生成的 `components/ui/`。
7. **手牌排序**：`mahjongTiles.ts` 新增纯函数 `sortTilesForDisplay(readonly TileId[])`，按万→筒→条→字牌及组内数字升序排列；同一牌面保持输入顺序，返回新数组且不修改 PlayerView.hand。`HandRow` 只排序面朝上的自己的手牌，点击继续提交该元素原始 TileId。

P4.1 定向验证：

- Playwright 在两种桌面视口运行真实四人 Junk 开局与一次出牌，验证权威 snapshot 后手牌/牌河仍更新。
- 每个视口断言 `scrollWidth <= clientWidth`、`scrollHeight <= clientHeight`，核心区域 bounding box 不越界且四家关键元素可见。
- `mahjongTiles.test.ts` 覆盖跨花色乱序、字牌、同牌面稳定性、非法 TileId 与输入不变；Playwright 断言手牌 DOM 按牌面顺序排列，并点击排序后的位置验证提交的仍是其 `data-tile-id`。
- 运行 Web typecheck、相关 Vitest/Playwright；回填实际结果并形成 P4.1 实现提交，然后暂停供用户查看。

P4.1 完成内容（2026-07-19）：

- Table 路由改为 `100dvh`、safe-area、页面级 `overflow-hidden` 的桌面壳；HUD、主舞台和自己的手牌轨道拥有独立空间，等待/永久托管状态沿用无滚动壳。
- 新增 `TableHud`、`TableBoard` 与 `CenterStatus` 组件；`TableView` 保留 socket、状态和动作编排。日志和 dev debug 临时收进固定 Diagnostics 折叠浮层，不再参与页面高度计算。
- ResizeObserver 同时读取舞台可用宽高，扣除自己的手牌轨道后计算正方形桌面核心和共享 `tileUnit`；删除整页按宽度缩放及 `min-w-[320px]` 溢出来源。
- 四家保持自己下、对家上、左右家对应左右的桌面拓扑；自己的手牌从核心中分离，四个 badge 增加庄家、分数、当前行动者和连接/AI 状态，牌墙、副露、牌河和中央状态保留。
- 手牌显示排序按用户反馈前移到 P4.1；PlayerView.hand 和动作协议保持不变。
- Playwright 新增两个目标桌面视口的真实四人 Junk 验收，检查 document 无滚动、核心边界、四家 badge/桌面区域/自己的手牌/中央状态可见，并在调整视口后完成一次出牌；旧恢复与 bloodbattle smoke 改用稳定 HUD test id。

P4.1 验证结果（2026-07-19）：

- `pnpm --filter @new-mj/web typecheck`：通过。
- Web Vitest：4 个文件、20 条测试通过；新增排序、稳定性、非法 TileId 与不修改输入覆盖。
- Web Playwright：24 条通过；包含 1440×900、1366×768 布局、手牌 DOM 排序与原 TileId 出牌、刷新恢复及 bloodbattle 公共骨架。
- `pnpm --filter @new-mj/web verify`：通过；typecheck、lint、unit、e2e、build 全绿。构建仅保留既有的大 chunk 警告。
- 按子阶段工作流，根目录 `pnpm verify` 留到 P4.5 的 Phase 4 最终阶段门。

#### P4.1 Storybook — 隔离场景验收（详细计划）

目的：真实对局继续承担协议与交互 e2e；Storybook 只保留单个 Tile 的稳定 Canvas，用于检查牌面、牌背、尺寸和方向。所有组合及整桌布局统一由 Layout Page 验收。

实现清单：

1. **基础设施**：采用与现有 React 19 + Vite 8 匹配的最新稳定 Storybook React-Vite；手工建立最小 `.storybook/main.ts`/`preview.tsx`，不生成示例 boilerplate。复用 `@` alias、Tailwind Vite plugin、`src/index.css`、`public/tiles` 静态目录和 Geist 字体。新增 `storybook`、`build-storybook` 脚本；静态输出加入 gitignore。
2. **验收工具栏**：Canvas 提供 light/dark 外观、Regular/Black 牌面和常用 viewport 切换。牌面主题进入 `tableLayout` 的纯展示状态，`Tile` 从中选择 `/tiles/{theme}/...`；正式 Table 默认先保持 Regular，Storybook 可即时比较两套 assets，用户决定后再单独调整产品默认值。
3. **固定缩放装饰器**：stories 不依赖真实 ResizeObserver；全局/局部 decorator 显式设置 `tileUnit`，保证相同 story 每次尺寸一致，并在卸载/切换时恢复，避免 story 间串状态。
4. **Tile stories**：全 34 种牌面 gallery、Regular/Black 对照、牌背、sm/md/lg、上下左右方向，以及 normal/clickable/selected/dimmed 状态。方向和状态使用矩阵展示，避免依赖逐个 controls 手工拼装。
5. **局部组件 stories**：
   - `HandRow`：自己的 13/14 张乱序输入与排序结果、interactive、对手牌背；上下左右方向。
   - `WallStack`：空、短墙、常规墙、上下左右方向。
   - `DiscardPile`：空、单排、多排、claimed tombstone、上下左右方向。
   - `MeldGroup`：空、吃、碰、杠、多个副露及上下左右方向。
   - `PlayerBadge`：自己/对手、庄家/当前行动者、真人/bot、断线/AI 托管、头像与长昵称。
   - `CenterStatus`：playing/claim/错误/带操作按钮。
6. **组合场景 stories**：`TableBoard` 提供空桌、开局、进行中多牌河/副露、声明窗口和紧凑高度压力场景；至少提供 1440×900 与 1366×768 的桌面 Canvas 参数。stories 使用静态可见 fixture，不建立 socket、不复制 core 规则、不伪装成端到端对局。
7. **组织与 review**：侧栏按 `Mahjong/01 Tile`、`02 Hand`、`03 Wall`、`04 Discards`、`05 Melds`、`06 Player`、`07 Center`、`08 Table` 排序。每个 story 标明其审查重点；用户可以先针对 Tile 确认尺寸/主题，再逐组件 review，最后查看整桌。

验收：

- `pnpm --filter @new-mj/web storybook` 能启动，所有 story 无 console/render error，toolbar 切换不会改变业务状态。
- `pnpm --filter @new-mj/web build-storybook` 成功，证明静态资源、alias、Tailwind 与类型配置可独立构建。
- 新增必要的 Vitest 覆盖牌面主题路径与 store reset；现有手牌排序、原 TileId 出牌和桌面 Playwright 保持通过。
- 执行 `pnpm --filter @new-mj/web verify`，回填 Storybook 数量/构建和 Web 阶段门结果，形成追加实现提交后暂停，由用户从 Tile 开始逐项 review。

完成内容（2026-07-20）：

- 安装 Storybook 10.5.2 React-Vite、a11y 与 themes 官方包；新增最小配置、`storybook`/`build-storybook` 脚本、静态目录忽略，并把 Storybook build 纳入 Web verify。
- preview 复用项目 `index.css`、Tailwind、Geist、Vite alias 和 `public/tiles`，提供 light/dark、Regular/Black 牌面及四个目标 viewport；正式 Table 默认仍为 Regular。
- `tableLayout` 增加纯展示 `tileTheme`；Tile 根据主题选择资产路径。Chromium 实测发现 Black SVG 的浅色字牌需要深色透明底，已在 Black 主题牌体上修正。
- 侧栏建立 8 组共 32 个 stories：Tile 4、Hand 3、Wall 2、Discards 3、Melds 3、Player 7、Center 3、Table 7；覆盖全 34 牌、牌背、尺寸、方向、交互状态、排序手牌、墙长、claimed 墓碑、副露、玩家状态、三种整桌压力场景和四种参考布局对比。
- stories 使用静态 fixture 和固定 tileUnit，不连接 socket、不复制 core 规则；真实对局仍由 Playwright 负责。
- 按用户指定的 `mj-next/src/app/game/page.tsx` 新增三层 nested rings story：A 忠实展示物理方向文字与 14×2 牌河，B 保持 14×2 但文字朝向用户，C/D 分别比较 8×3 与 6×4；牌墙固定为 18×2 牌背。只改 Storybook fixture，未提前改变真实 Table。
- 首轮 reference fixture 经用户 review 发现非正方形、牌重叠和间隙过大；修正为显式同值 CSS 宽高，按参考源码的“80% 玩家轨道宽度 ÷ 20”固定 story tileUnit，并增加 70% `grid` 牌尺寸。对手手牌、牌墙和牌河现在按各自网格紧密排列，8×3 Chromium 复查无重叠或裁切。
- reference comparison 按用户要求补充副露：自己展示吃+碰、上家碰、右家杠、左家无副露，并按副露数量减少各家暗手数量；副露位于玩家外圈并随上下左右方向排列。
- 第三轮 review 暂时移除真实牌面与旋转变量，只验证区域尺寸、容量、增长方向与边界：所有区域和 Tile 尺寸均由牌桌边长按比例计算，手牌/副露 Tile 最大、牌河次之、牌山最小，各自保持 5:7 牌面比例（左右方向只交换宽高），并集中为 CSS 比例变量以便 UI review 调整。手牌区与副露区使用独立边框和固定锚点；13 张主体槽不因抓打重新居中，抓牌侧永久保留“间隔 + 第 14 槽”；副露预留固定组槽并只向后追加，新增吃碰杠不能移动或重新居中已有副露。牌山环与牌河环之间保留相对尺寸的隔离带，二者不得重叠。透明交叉线表示空槽、白色表示牌面、灰色表示背面；牌山与牌河接近最大容量并保留空槽用于检查增长方向。要求 Tile 不重叠、不越出所属区域。

验证结果（2026-07-19）：

- `pnpm --filter @new-mj/web build-storybook`：通过，32 个 stories 的 manager、preview、Tailwind、alias、字体及两套 tile assets 成功静态构建。
- Chromium 实际加载 Regular Tile Gallery、Black Tile Gallery 与 Busy Mid Game Table Canvas：均完成渲染，无加载/运行错误；Black 34 种牌面全部可见。
- Web Vitest：4 个文件、21 条测试通过；新增 Regular/Black 牌面与牌背路径覆盖。
- Web Playwright：24 条通过；现有桌面布局、手牌排序与原 TileId 出牌、恢复及 bloodbattle 骨架无回归。
- `pnpm --filter @new-mj/web verify`：通过；typecheck、lint、unit、e2e、app build、Storybook build 全绿，仅保留既有大 chunk 警告。

#### P4.1 Layout Lab — 参数化整桌布局验收（详细计划）

目的：整桌布局需要连续调整区域比例、锚点、容量和间距，Storybook controls 不适合表达这些相互依赖的参数。新增开发专用 Layout Lab，以左侧实时牌桌和右侧参数面板完成空间设计；Storybook 继续负责 Tile、手牌、副露、牌河等单组件离散状态，不再维护 A–D 整桌 reference comparison，避免两套整桌 fixture 漂移。

本步骤只设计布局，不接 socket、core、真实牌面、动画或产品视觉；不改变正式 Table。实现完成并验证后形成单独提交，再暂停由用户调参验收。

实施清单：

1. **配置契约**：新增纯 `TableLayoutConfig` 与 `DEFAULT_TABLE_LAYOUT_CONFIG`，按 board、player tracks、meld、hand、wall、discard、center、debug 分组。区域尺寸统一使用父容器比例；Tile 由所属区域的短边比例计算，手牌/副露最大、牌河次之、牌山最小，并各自保持统一牌面宽高比。配置带 schema version、有限数校验、上下限 clamp 和未知字段忽略，避免旧 localStorage 值破坏页面。
2. **开发路由**：新增 `/dev/table-layout`，仅在 `import.meta.env.DEV` 时注册，不进入登录/房间 loader，也不出现在生产构建路由。页面使用 `100dvh`、左侧 `minmax(0,1fr)` 预览和右侧固定宽度可滚动控制面板；预览仍可选择正方形桌面及 1440×900、1366×768、390×844、844×390 容器预设，但本小步只验收线框空间，不承诺 P4.2/P4.3 的正式响应式实现。
3. **布局组件迁移**：把 `ReferenceLayout.stories.tsx` 中可复用的 Ring、区域和占位 Tile 迁入 Layout Lab 组件，Storybook 删除 A–D reference stories。初始线框模式以白色表示牌面、灰色表示背面、透明交叉线表示空槽；后续 review 改用真实牌图，并保留区域边框与空槽开关。
4. **玩家轨道模型**：每家建立同一个方向无关模型，再通过方向映射到上下左右。副露区与手牌区上沿对齐、副露高度较小；两者都占满玩家轨道高度并允许区域边界重叠。副露从一端固定槽位向内追加，手牌从相反一端向内排列，抓牌侧永久保留间隔和第 14 槽；已有副露、主体手牌和抓牌槽均不因抓打或新增副露重新居中。占用总量约束保证 Tile 本身不得相交，即使父区域边界重叠。
5. **牌山与牌河模型**：牌山环和牌河环使用独立父区域，二者之间保留可调隔离带；任何参数组合经 clamp 后仍不得发生 Tile 或区域内容覆盖。所有区域使用完整矩形边框，增长方向只由 Tile 排列表达。牌河提供 14×2、8×3、6×4 预设及自定义行列参数，中区按剩余空间计算。
6. **实时控制面板**：使用原生 range/number/select/checkbox 控件，不引入表单依赖。首批可调参数覆盖外圈/牌山环/隔离带/牌河环/中区、四类 Tile 比例、牌面宽高比、固定像素 Tile gap、抓牌间隔、牌河行列和 debug 边框。每次输入即时更新预览；面板显示最终 clamp 后值，非法输入不能进入渲染树。
7. **占位模拟**：副露牌数支持 0–16 直接调节；以稳定 slot key/固定锚点渲染，便于肉眼确认增加副露时旧副露不移动、手牌只从左侧减少。抓牌开关只改变最右端第 14 槽，前 13 槽位置不变。提供接近满容量的牌山与牌河状态检查增长端空槽。
8. **保存与交接**：配置变更 debounce 后写入带版本的 `localStorage`，刷新自动恢复；提供“重置默认值”“复制 JSON”“导入 JSON”“下载 JSON”操作。保存只影响当前浏览器的开发工具，不写 server/数据库，也不直接修改正式 Table。面板额外提供“复制 TypeScript 默认配置”，用户确认最终参数后再由后续独立提交写回默认配置并接入正式 Table。
9. **可访问性与窄屏工具行为**：所有控件有 label、当前值和键盘操作；保存/导入结果使用页面内状态提示。Layout Lab 自身在窄 viewport 将控制面板变为右侧 drawer/覆盖层，保证预览区域仍可见；这只是调试工具可用性，不替代正式手机牌桌阶段。

验收：

- 单测覆盖配置默认值、版本迁移/拒绝、clamp、localStorage 恢复、非法 JSON 和未知字段。
- Playwright 直接进入开发路由，验证参数调整立即改变预览 geometry，刷新后恢复，重置后回到默认值；依次切换 14×2、8×3、6×4、副露数量和抓牌开关，断言 Tile bounding boxes 不越出所属区域且牌山/牌河内容不相交。
- Playwright 记录一组副露和前 13 个手牌 slot 的 bounding boxes，执行“新增副露”和“抓牌”后断言既有 slot 坐标不变，第 14 槽仅改变占用状态。
- 生产构建中 `/dev/table-layout` 不注册；Storybook 单组件 stories 继续构建，reference comparison 已移除。
- 执行 `pnpm --filter @new-mj/web verify`；回填 Layout Lab 实现、验证结果和下一步第一个具体动作，形成实现提交后暂停，未收到明确指令不 merge P4.1。

完成内容（2026-07-19）：

- 新增带 version 1 的 `TableLayoutConfig`、默认值、范围收敛和 localStorage 单一读写入口；非法 JSON、未知版本、非有限数、越界值和未知字段均不能进入渲染配置。
- 新增开发态专用 `/dev/table-layout`：左侧真实 Tile 预览、右侧实时控制面板；生产构建经 bundle 检查不包含该路由。窄屏时参数面板收进可开关的右侧 overlay。
- Tile 使用所属父区域的 CSS container size 计算：手牌/副露、牌河、牌山分别调整短边比例并共享牌面宽高比；网格以配置比例为高度上限，并同时按行列容量和固定间距收敛到父区内。预览复用正式牌图和主题 store，但不读取 socket、core 或正式对局状态。
- 四家只维护一个下家玩家轨道模型，上、左、右通过整体 180°/±90° 旋转得到。下家副露区与手牌区使用独立宽度、上沿对齐且允许父区域重叠，不再相互反算或自动收缩；副露最多 16 槽并按可调数量从左向右占用，手牌按“13 - 副露数”从右向左占用，左侧保留空间，抓牌只填最右端永久预留的第 14 槽。
- 所有含牌区域始终保留计入 element 尺寸的 `2px border`，不设额外 padding；关闭 showRegions 只把 border 变透明，不改变 content box、Tile 尺寸或坐标。Hand、Meld、Discard、Wall 分别按其父区域高度百分比控制 Tile 高度，宽度由统一牌面比例计算；四类高度上限开放到 80%，便于主动观察溢出临界点。Wall/Discard 的完整 Tile 网格在父区域内居中，空槽仍留在增长末端。
- Player track、Wall track、Discard track、Meld width、Hand width 与 Meld height 等区域尺寸参数的最小值统一开放到 5%；隔离带仍可为 0%。
- Meld width 与 Hand width 保持独立配置，最大值均开放到父轨道宽度的 100%。
- 取消牌山区域的边框开口；所有 debug 区域统一显示完整矩形边框。
- 用户最新提供的候选桌面 JSON 已设为 Layout Lab 默认配置；具体参数只在配置代码中维护，不在计划文档重复记录。Layout Page 使用真实 Tile 资源，并支持隐藏区域边界/空槽；真实 Tile 模式同时移除占位矩形 border，间距由共享固定像素 Tile gap 参数控制。正式 Table 尚未接入，等待该候选布局验收。
- 牌山环与牌河环独立并保留可调隔离带；支持 14×2、8×3、6×4 牌河、0–16 副露牌数和抓牌显示开关。
- 参数按 board/player/tiles/discard/debug 分组；支持四种目标 viewport、实时 clamp、debounce 自动保存、刷新恢复、重置默认值、JSON 复制/导入/下载及 TypeScript 默认配置复制。
- Storybook 删除全部布局及组合组件 stories，只保留 4 个 Tile 自身 stories；所有空间参数设计只在 Layout Page 维护。
- Chromium 1440×900 实际加载并操作页面；修正首次实测发现的正方形按宽度溢出、槽位居中而非相反端锚定，以及 viewport 预设未按宽高共同约束的问题。

验证结果（2026-07-20）：

- Web Vitest：5 个文件、25 条测试通过；配置测试覆盖缺失/非法存储、未知版本、clamp、未知字段及旧 Tile gap 字段兼容。
- Layout Lab Playwright：4 条通过；覆盖参数保存/刷新/重置、三种牌河的牌山/牌河不相交且不越桌、区域边界几何，以及新增副露/抓牌时已有 slot 坐标不变。
- Web Playwright：28 条全部通过；新增 showRegions 前后区域/Tile geometry 完全一致、所有含牌区域保留 2px border 且 padding 为 0 的覆盖，既有真实对局、恢复、大厅与主题路径无回归。
- 根目录 `pnpm verify`：通过；format、typecheck、lint、build、unit、core fuzz、server e2e 21 条和 Web e2e 28 条全绿，仅保留既有大 chunk 警告。
- Storybook 静态构建通过，索引只包含 4 个 Tile 自身 stories。
- 生产 `dist` 检查确认不包含 `/dev/table-layout`。

Layout Lab 尺寸计算方式调整（2026-07-20，仅内部实现，未改变已验收的视觉/参数设计）：

- 原实现用 CSS container query（`cqw`/`cqh` + `calc()`）在每个区域内部现算 Tile 尺寸；`cqw`/`cqh` 在未来 Expo/React Native 上没有等价能力，讨论后决定改为不依赖 container query 的方案，同时不引入"顶层单点测量后用 JS 逐层复刻百分比树"的替代方案——后者要求所有中间层元素零 margin/padding/border 才能保证算出的像素和实际渲染一致，属于隐性且脆弱的不变量。
- 改为在真正需要"给定这块区域的实际像素，牌该多大"这一步（原 `Slots` 组件的 `min()` 公式）直接用 `ResizeObserver` 测量该区域自己的真实 content-box 像素（天然已排除 border/padding，不受中间层样式影响），新增纯函数 `apps/web/src/lib/tableGeometry.ts` 的 `fitTileGrid(containerWidthPx, containerHeightPx, config)` 承接原 CSS 公式的等价算术，零 DOM 依赖、带单元测试。`Ring`/`DirectionalSurface` 负责的区域比例切分和旋转定位本来就是普通 CSS 百分比 + transform，不依赖 container query，未改动；最外层"撑满可用空间的正方形桌面"以及 `DirectionalSurface` 内部旋转补偿仍保留 `cqw`/`cqh`，本轮不在范围内。
- 正式 Table（`TableView`/`TableBoard`/`Tile` 等）未接入，仍是现状的全局 `tileUnit` 方案；是否推广、如何处理副露与手牌分层、PlayerBadge 位置等问题留待用户后续决定后再单独立项，不在本轮范围。
- 验证结果：新增 `tableGeometry.test.ts`（6 条，覆盖高度上限/行收敛/列收敛/宽高比/零尺寸/已知输入手算校验）；`pnpm --filter @new-mj/web verify` 全绿——typecheck、lint、Vitest 31 条（含新增 6 条）、Playwright 28 条（含 Layout Lab 4 条，断言的具体像素/坐标值与改动前一致）、build、build-storybook 全部通过。

#### P4.1 收尾 — 接入正式 Table（详细计划）

目的：Layout Lab 的空间设计与刚验证过的尺寸计算方式（真实叶子容器 `ResizeObserver` 测量 + `fitTileGrid` 纯函数，见上一小节）已经就绪，把它接入正式 `TableView`，替换现状"12/13/18 固定百分比三层嵌套 + 全局 `tileUnit` 三档位"的实现。这是 P4.1 的最后一个子步骤，完成并经用户验收合并后 P4.1 才算整体完成；**P4.2（手机横屏）在本子步骤合并前依旧不得创建或细化**。

设计要点（用户已确认）：

1. **副露与手牌同层**：采用 Lab 语义，副露(meld)与手牌(hand)合并进最外层 player track，四个方向统一（含自己），不再像现状把副露和牌河放在一起；牌河(discard)单独在更内层的 discard track。
2. **PlayerBadge 暂居中心区域**：Lab 是纯几何实验，没有玩家名牌的位置；过渡方案是把四个 `PlayerBadge` 和 `CenterStatus` 一起放在最中心格，后续如有需要再调整，本次改动在代码注释/本小节注明这是临时方案。
3. **尺寸模型**：沿用刚在 Lab 验证过的方式——每个需要"给定实际像素、牌该多大"的叶子区域（meld/hand/wall/discard 四类）各自用 `ResizeObserver` 测真实 content-box 像素，喂给 `fitTileGrid` 纯函数；不引入"顶层单点测量 + JS 全树推导百分比"的方案（对中间层 margin/padding/border 隐性敏感）。`Ring`/`DirectionalSurface` 的比例切分和旋转定位继续用普通 CSS 百分比 + transform，不需要改动语义。
4. **旋转语义从"逐张 Tile 自转"改为"整个方向区域整体旋转"**：`DirectionalSurface` 已经按方向整体 `rotate()`；`Tile.tsx` 不再需要 `ROTATE_CLASS`/`direction` 自转分支，统一交给 `DirectionalSurface`。`bottom`（自己）本来就是 `rotate(0)`，视觉不变；其余三个方向的效果应与今天等价或更整齐（不会有单张牌歪斜错位）。
5. **Lab 与正式 Table 共用同一套布局数学**：把 `Ring`/`DirectionalSurface`/`useMeasuredSize` 从 `LayoutLabPreview.tsx` 抽到共享文件 `apps/web/src/components/mahjong/TableGeometry.tsx`，两边都从这里导入，不再各自维护一份。

实施清单：

1. 新建 `apps/web/src/components/mahjong/TableGeometry.tsx`：搬入 `Ring`、`DirectionalSurface`、`useMeasuredSize`；`LayoutLabPreview.tsx` 改为从这里导入，Lab 对外行为不变（现有 4 条 Layout Lab Playwright 必须继续通过）。
2. `Tile.tsx`：移除 `useTableLayoutStore().tileUnit`、`SIZE_SCALE` 和自算的 `containerStyle`/`imageStyle`；改为接收调用方传入的像素宽高。移除 `ROTATE_CLASS`/`direction` 自转分支。`clickable`/`selected`/`dimmed` 等 cva 变体、点击回调、`data-testid`/`data-tile-id` 保持不变（Phase 5 操作 Dock 还要用）。`tileTheme` 继续从 `useTableLayoutStore` 读；`tileUnit`/`setTileUnit` 无调用方后从 store 删除。
3. `HandRow`/`MeldGroup`/`DiscardPile`/`WallStack`：接收 `containerWidthPx`/`containerHeightPx` 及各自的网格参数（columns/rows/heightPct/growth），内部调用 `fitTileGrid` 得到像素尺寸后渲染真实 `<Tile>`；不再需要 `direction` 相关的 flex-row/col 布局分支（旋转已交给外层 `DirectionalSurface`），但仍需要 `direction` 用于 `data-testid` 等标识。
4. 重建 `apps/web/src/components/mahjong/TableBoard.tsx`：用 `Ring`（`board.playerTrackPct`）→ 四方向 player track（meld 子区域 + hand 子区域，各自 `useMeasuredSize`）→ `Ring`（`board.wallTrackPct`+`ringGapPct`）→ 四方向 wall track → `Ring`（`discard.trackPct`/`columns`/`rows`）→ 四方向 discard track；中心格合并 `CenterStatus` + 四个 `PlayerBadge`。`DEFAULT_TABLE_LAYOUT_CONFIG` 直接从 `@/lib/tableLayoutLab` 导入当常量用，不做本地拷贝、不接 dev 控件、不接 localStorage。
5. `TableView.tsx`：移除 `tableStageRef`/`ResizeObserver`/`setTileUnit`/`TILE_UNIT_DIVISOR`/`SELF_RAIL_RESERVE`（新设计里没有独立于核心方桌之外的"自己手牌 rail"，也没有需要顶层测量的全局 `tileUnit`——每个叶子区域各自测量）；`PlayerBadge` 渲染从 `seatLayers` 挪到传给 `TableBoard` 的中心区域。其余数据流（`seatData`/`playerInfo`/`claimOptions`/`sendAction` 等）不变。
6. Playwright 选择器同步更新：`self-hand-rail`（不再存在，自己手牌现在是核心方桌 bottom 方向 player track 的一部分）、`seat-${direction}`（内容从"badge+hand"变成"meld+hand"，badge 挪去中心，语义变了，改名为 `player-track-${direction}`）需要更新 `test/table.e2e-spec.ts` 的 `expectDesktopTableFits` 断言；`table-area-${direction}` 改为专指 discard track（现状断言"打出的牌出现在 `table-area-bottom`"的语义保留，只是不再包含 meld）。

验证：

- `pnpm --filter @new-mj/web typecheck`、`lint`。
- 现有 Web Vitest（Tile/HandRow/mahjongTiles 等单测）按新 props 接口更新断言。
- 现有 Layout Lab Playwright（4 条）继续通过（`TableGeometry.tsx` 抽取是纯移动，不改变 Lab 行为）。
- 更新后的 Table Playwright（1440×900、1366×768 桌面视口真实四人 Junk 开局+出牌、bloodbattle 公共骨架、刷新恢复）必须继续通过。
- 手动用 `pnpm --filter @new-mj/web dev` 跑一局真实四人对局（或本地 + AI 补位），肉眼确认桌面横屏下副露/手牌同层（含自己）、牌河独立、中心区域信息不过分拥挤。
- 全部通过后执行 `pnpm --filter @new-mj/web verify`，回填验证结果，形成实现提交。

完成内容（2026-07-20）：

- 新增 `components/mahjong/TableGeometry.tsx`（`Ring`/`DirectionalSurface`，从 `LayoutLabPreview.tsx` 抽出）与 `lib/useMeasuredSize.ts`（`ResizeObserver` 测真实 content-box 像素的共享 hook）；`LayoutLabPreview.tsx` 改为从这里导入，Lab 行为不变。
- `Tile.tsx` 改为吃调用方传入的 `widthPx`/`heightPx`，去掉 `useTableLayoutStore().tileUnit`/`SIZE_SCALE` 和逐张 `ROTATE_CLASS` 自转；`tileTheme` 继续保留在 store，`tileUnit`/`setTileUnit` 已删除（含 Storybook `preview.tsx` 装饰器同步更新）。`Tile.stories.tsx` 改为显式传像素尺寸，原 "Directions" story（验证逐张旋转）随该能力一起移除——旋转验证已由 Lab/Table 的整体区域几何覆盖。
- `HandRow`/`MeldGroup`/`DiscardPile`/`WallStack` 改为接收 `containerWidthPx`/`containerHeightPx`+`config`，内部调用 `fitTileGrid` 得到像素尺寸后渲染真实 `<Tile>`；固定的最大容量（hand 14/meld 16/wall 18×2）只用于尺寸计算，保证牌数变化时 tile 尺寸不跳动，实际渲染改用 flex + `justify-end`/`justify-start`/`center` 定位（`w-full h-full` 撑满整个已分配区域，让 justify 方向对齐区域真正的边界，而不是被 `place-items-center` 收缩居中）；discard/wall 用 `flex-wrap` 按配置列数换行，超出配置容量时长出新行而不裁切。
- 重建 `TableBoard.tsx`：三层 `Ring`（player track 含副露+手牌同层、wall track、discard track）+ 中心格合并 `CenterStatus`+四个 `PlayerBadge`；不再需要 `stageRef`/`coreSize`（顶层用 `min(100cqw,100cqh)`，由 `TableView` 提供一个 `containerType:size` 的舞台包裹）。
- `TableView.tsx` 移除 `tableStageRef`/`ResizeObserver`/`setTileUnit`/`TILE_UNIT_DIVISOR`/`SELF_RAIL_RESERVE`，不再有独立于核心方桌之外的"自己手牌 rail"；改为构建 `seats: Record<SeatDirection, SeatContent>`（真实 melds/hand/handCount/interactive/onDiscard）和 `discards: Record<SeatDirection, DiscardEntry[]>` 交给 `TableBoard`，四个 `PlayerBadge` 随 `CenterStatus` 一起传入中心区域（过渡方案，见上）。
- Playwright 测试同步更新：`self-hand-rail` 断言移除（不再存在），`seat-${direction}` 改名为 `player-track-${direction}`；`table-area-${direction}` 现在专指 discard track。
- 手动验证：起本地 dev server + 4 个开发态账号跑一局真实 Junk 开局，1440×900/1366×768 截图确认副露+手牌同层、牌河独立、中心区域信息可读；并用 Playwright 精确测量 `player-track-bottom` 与最后一张手牌的右边界间距为 0px，确认手牌确实贴靠区域右边界（而非被居中）。

验证结果（2026-07-20）：

- `pnpm --filter @new-mj/web typecheck`/`lint`：通过。
- Web Vitest：6 个文件、31 条测试通过（原有用例针对新 props 接口的行为未受影响，未发现需要新增/修改的断言）。
- Web Playwright：28 条通过，含更新后的 `player-track-${direction}`/`table-area-${direction}` 断言、Layout Lab 4 条（`TableGeometry.tsx` 抽取对外行为不变）；`test/lobby.e2e-spec.ts` 的"leaving an in-game room"用例在本沙盒 3-worker 并发下出现过 2 次超时，单独运行/单 worker 全量运行均稳定通过，判定为与本次改动无关的环境级并发 flake（该用例只涉及离房流程，不接触 Table 渲染）。
- `pnpm --filter @new-mj/web build`/`build-storybook`：通过，仅保留既有大 chunk 警告。
- `docs/process/table-ux-plan.md` 与 `apps/web/AGENTS.md` 相应条目已同步更新（`tableLayout.ts`/`components/mahjong/`/Layout Lab 描述）。

#### P4.1 收尾补充 — 接入 Layout Lab 的 bottom-region 新原型（2026-07-20）

背景：上一步"接入正式 Table"完成、等待用户浏览器验收期间，Layout Lab 又做了一次 bottom-region 重设计（commit `ad3f688`）：手牌区独立成一圈（三列——空列/居中或右对齐的手牌/摸牌钉住列），原来牌墙占的那一圈改成"副露（左，底对齐）+ 玩家信息（右，反向旋转常读）"，弃用可视化牌墙堆，墙牌数量只在中心文字展示；但这套新原型当时只存在于 `config.lab.hand`/`config.lab.meldInfo` 这个专门跟正式布局隔离的命名空间，正式 `TableBoard` 完全不读。用户要求把这套新方案接到真正的对局页面，并让 Lab 与正式 Table 复用同一套组件，以后调布局只改 `tableLayoutLab.ts` 的参数。

设计要点：

1. **抽出共享组件**：新增 `components/mahjong/HandTrack.tsx`（手牌区三列布局 + 摸牌钉住列，测一次 `fitTileGrid` 把尺寸交给 `children` 渲染实际手牌内容）与 `MeldInfoTrack.tsx`（副露+信息区，测一次 meld 列尺寸交给 `renderMeld`）；`HandRow`/`MeldGroup` 相应从"自己测容器、自己算 `fitTileGrid`"改为"接收调用方（共享壳组件）算好的 `tileWidthPx`/`tileHeightPx`"——单一尺寸计算入口，不会出现 Lab 和正式 Table 两份公式打架。`MeldGroup` 同时从固定 16 列单行改成 flex-wrap（整组换行，不挤压单张牌尺寸），跟 Lab 原型的排布方式一致。`LayoutLabPreview.tsx` 改为直接调用这两个共享壳组件（喂合成数据），正式 `TableBoard.tsx` 也调用同一对壳组件（喂真实 `hand`/`melds`/`justDrawn`）。
2. **摸牌钉住列做成真功能**：Lab 原型里这一列此前只是纯视觉占位。为了在正式桌面上真正显示"谁刚摸了牌"，给 junk 的 core+protocol 加了 `justDrawn`：`JunkPlayerView.seats[].justDrawn`（布尔，公开——"这一家刚摸牌还没行动"这件事本就不是秘密）+ 顶层 `justDrawn?: TileId`（仅本人可见的真实牌面）。自己视角显示真实牌面，其余三家视角显示扣着的牌背。详见 `docs/variants/junk.md` §7 与 `packages/core/src/rulesets/junk/{types,state-machine,view}.ts`。
3. **弃用 `WallStack`**：新布局不再可视化牌墙堆，`WallStack.tsx` 删除（墙牌数量继续在 `CenterStatus` 的文字里体现，原本就有，不用改）。
4. **PlayerBadge 迁移单独再做**：新的信息列这次只放最简占位文字（昵称），不接入完整 `PlayerBadge`（头像/庄家/托管/比分）；中心区域不再堆 4 个 `PlayerBadge`。这是用户明确要求分两步做的取舍，`PlayerBadge` 何时、以何种形式迁入这个新槽位留作后续任务。
5. **config 清理**：`tableLayoutLab.ts` 的 `lab.hand`/`lab.meldInfo` 提升为顶层 `hand`/`meldInfo`（不再是跟正式布局隔离的实验字段）；删除因此变为死字段的 `board.playerTrackPct`/`wallTrackPct`/`ringGapPct`、`player.*`、`tiles.handShortPct`/`meldShortPct`/`wallShortPct`（`board.ringGapPct` 原本只给旧 wall track 做视觉留白，Lab 预览从未用上，新的三圈嵌套结构对齐 Lab、不再需要这层留白）。

验证结果（2026-07-20）：

- `pnpm --filter @new-mj/core verify`：typecheck/lint/test/build 全绿，含 junk fuzz（1000 seeded games + `fuzzJunkGames(100,...)`）与新增的 `justDrawn` 可见性/清空单测；`cross-ruleset-invariants.test.ts`（事件重建≡直接派生，逐 action 对全部 4 个视角比对）覆盖到新增字段，验证 robKong 待裁决窗口期间 `justDrawn` 在两条路径上保持一致（这是本次设计里唯一需要小心的时序点：宣告补杠但仍待抢杠裁决时，`justDrawn` 要等真正裁决落定才清空，不能在宣告的瞬间就清）。
- `pnpm --filter @new-mj/web verify`：typecheck/lint/test（6 文件 31 条）/test:e2e（28 条，含更新后的 `test/table.e2e-spec.ts` 与 `test/layout-lab.e2e-spec.ts`）/build/build-storybook 全绿。
- 尚未做浏览器人工验收（真实四人开局 + 1440×900/1366×768 视口目视检查）。

Phase 4 最终验证（留到 P4.5 后）：

- 扩展 Table Playwright：同一真实 Junk 对局依次验收 1440×900、1366×768、390×844、844×390；每个视口断言 `documentElement.scrollWidth/scrollHeight` 不超过 client 尺寸、board 完整位于 viewport、四个 badge/自己的手牌/中央状态均可见且无核心元素裁切。
- Playwright 覆盖菜单抽屉、Leave 确认、dev debug、结算面板与 replay 链接；至少在 light/dark 各检查一次 table token 生效，现有 junk discard 与 bloodbattle 公共骨架用例继续通过。
- 定向单测和多视口 e2e 通过后执行根目录 `pnpm verify`，回填结果并提交，停在 P4.5 branch 等待用户 merge 指令。

### [ ] Phase 5 — 完整操作 Dock 与 AI 推荐

Branch：`feat/table-action-dock`

Merge commit：待合并

目标：

- 展示全部 junk 合法动作，补齐 `zimo/anGang/buGang`；按出牌、吃、碰、杠、胡、过分组并支持组合子选项。
- AI 推荐动作、组合和弃牌默认选中；用户可以改选。
- 所有动作统一采用“选择后确认”；请求期间防重复输入，snapshot 后清空，失败时恢复。
- 展示 server deadline 倒计时；本地归零只进入等待状态。
- 新增普通出牌回合 timer：`DISCARD_TIMEOUT_MS` 默认 10000ms，配置校验与调试长值规则对齐 `CLAIM_TIMEOUT_MS`；只在当前真人具有合法 discard 时由 server 计时，超时从 `getLegalActions` 过滤 discard 后提交最后一项（通常对应刚摸入、位于 core 手牌末尾的牌），仍走正常 `runAction`。声明窗口继续使用独立 claim deadline。
- 普通出牌 deadline 同样由 server 下发并在 Dock 展示；本地归零只锁定操作并等待权威 snapshot，不自行 discard。主动出牌、回合切换、托管、局终、切局和房间关闭必须清理 timer，旧回调不得跨上下文出牌。
- 支持键盘、触屏命中区、焦点、禁用与错误反馈。

### [ ] Phase 6 — 事件驱动牌桌动画

Branch：`feat/table-event-animations`

Merge commit：待合并

目标：

- 建立 `authoritativeSnapshot`/`presentedView` 双状态与非权威事件动画队列，覆盖摸牌、出牌、吃碰杠胡、回合、牌墙变化和结算。
- 动画期间锁定操作；动画结束后才提交对应 snapshot 并展示其中的可选动作，防止下一状态按钮早于动画出现；积压、失焦恢复和重连时快速追平最新权威状态。
- `prefers-reduced-motion` 下跳过位移动画但保留状态反馈。

### [ ] Phase 7 — 全站视觉与体验统一

Branch：`feat/web-visual-refresh`

Merge commit：待合并

目标：

- 将牌桌设计系统应用到登录、游戏选择、大厅、房间和 Replay。
- 统一布局、间距、层级、按钮、加载/空/错状态和明暗主题，并接通现有 ThemeToggle。
- 建立全局 Toast 与路由错误恢复：访问已不存在/无权进入的 lobby、table 或 replay URL 时，不直接渲染 `ROOM_NOT_FOUND` 等协议错误字样，而是显示用户可读 Toast 后按会话状态跳转到可用页面；访问未匹配路由时同样用 Toast 替代裸 `404 Not Found`，已登录回 `/games`，未登录回 `/login`。
- 覆盖直接输入 URL、刷新失效 URL、客户端导航和冷启动恢复四条路径；跳转不能循环，Toast 在目标页面可见且只显示一次。
- 不改变这些页面的业务流程、路由或协议。

### [ ] Phase 8 — 综合验收与计划收尾

Branch：`test/table-ux-acceptance`

Merge commit：待合并

目标：

- 验收真人 + AI 垃圾胡完整流程：刷新/断线恢复、声明超时、全部动作、结算与 Replay。
- 完成多视口、键盘、触屏、明暗主题、reduced-motion 和慢网络验收。
- 执行根 `pnpm verify`，记录结果并按 `../doc-map.md` §6 将耐久内容吸纳进 contracts/architecture/decisions/AGENTS。
- 总 plan 更新为完成状态和下一个待办的首个动作；清理本文件中不再有价值的推演细节。

## 5. 全局验收门

每个 Phase 都必须满足：

- 实现与测试在同一阶段 branch。
- 定向测试通过，根目录 `pnpm verify` 全绿。
- `plan.md` 与本文件准确记录阶段状态、验证结果和下一步第一个动作。
- 工作树除该阶段预期内容外干净，形成提交后停止。
- 未收到用户明确 merge 指令时，main、其他 branch 和远端状态均不得改变。
