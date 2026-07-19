# Junk Table UX 分阶段实施计划

> 状态：Phase 2 已本地 squash merge；Phase 3 尚未开始。
>
> 本文件保存专题设计、阶段依赖、阶段细化内容与验收记录；`plan.md` 只保留总进度、当前阶段和下一步第一个动作。

## 1. 目标与边界

本专题把垃圾胡 Table 打磨成完整产品体验：桌面与手机 Web 全屏无页面滚动、核心对局内容不裁切、合法动作完整可操作、AI 给出一个合法推荐、server 提供可配置声明超时、客户端按权威快照同步并播放事件动画，同时把现代麻将桌视觉系统推广到其他 Web 页面。

边界：

- 只完整验收垃圾胡；bloodbattle 只保证公共骨架不回归，换三张/定缺等进入总待办。
- UI 延续现有英文，本专题不做国际化。
- AI 第一版只推荐一个合法动作，不承诺向听、牌效分数或解释。
- 声明倒计时只用于可以合法 `pass` 的窗口；普通摸打回合不自动弃牌。
- 本轮不加入音效。

## 2. 阶段工作流

本专题经用户明确确认，临时覆盖 `workflow.md` 的 trunk-based 默认方式：

1. 每个 Phase 必须从最新本地 `main` 创建下表指定的独立 branch；前一 Phase 未合并不得开始后一 Phase。
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

### [ ] Phase 3 — AI Advice 数据链路

Branch：`feat/table-ai-advice`

目标：

- 实现 `packages/ai` 的可见信息推荐入口和 `game:advice` schema/handler/service。
- web 完成 advice 获取、缓存和按 seq/deadline 失效；本阶段不重做操作 UI。
- 覆盖空动作、推荐合法性、胡/自摸优先、身份隔离、隐藏信息与 stale response。

### [ ] Phase 4 — 视觉基础与全屏 Table 骨架

Branch：`feat/table-fullscreen-layout`

目标：

- 建立翡翠绿、暖金和深色中性 chrome 的现代麻将桌 token。
- Table 使用 `100dvh`、safe-area 与 `overflow-hidden`；牌桌尺寸同时受可用宽高约束。
- 核心区域完整展示四家玩家、手牌/数量、牌墙、副露、弃牌、局数/庄家、当前行动者、剩余牌和连接/AI 状态。
- 离桌、设置、事件日志、dev debug 放入浮层/抽屉；结算改为正式结果面板。
- 覆盖 1440×900、1366×768、390×844 与手机横屏，无页面滚动和核心内容裁切。

### [ ] Phase 5 — 完整操作 Dock 与 AI 推荐

Branch：`feat/table-action-dock`

目标：

- 展示全部 junk 合法动作，补齐 `zimo/anGang/buGang`；按出牌、吃、碰、杠、胡、过分组并支持组合子选项。
- AI 推荐动作、组合和弃牌默认选中；用户可以改选。
- 所有动作统一采用“选择后确认”；请求期间防重复输入，snapshot 后清空，失败时恢复。
- 展示 server deadline 倒计时；本地归零只进入等待状态。
- 支持键盘、触屏命中区、焦点、禁用与错误反馈。

### [ ] Phase 6 — 事件驱动牌桌动画

Branch：`feat/table-event-animations`

目标：

- 建立 `authoritativeSnapshot`/`presentedView` 双状态与非权威事件动画队列，覆盖摸牌、出牌、吃碰杠胡、回合、牌墙变化和结算。
- 动画期间锁定操作；动画结束后才提交对应 snapshot 并展示其中的可选动作，防止下一状态按钮早于动画出现；积压、失焦恢复和重连时快速追平最新权威状态。
- `prefers-reduced-motion` 下跳过位移动画但保留状态反馈。

### [ ] Phase 7 — 全站视觉与体验统一

Branch：`feat/web-visual-refresh`

目标：

- 将牌桌设计系统应用到登录、游戏选择、大厅、房间和 Replay。
- 统一布局、间距、层级、按钮、加载/空/错状态和明暗主题，并接通现有 ThemeToggle。
- 建立全局 Toast 与路由错误恢复：访问已不存在/无权进入的 lobby、table 或 replay URL 时，不直接渲染 `ROOM_NOT_FOUND` 等协议错误字样，而是显示用户可读 Toast 后按会话状态跳转到可用页面；访问未匹配路由时同样用 Toast 替代裸 `404 Not Found`，已登录回 `/games`，未登录回 `/login`。
- 覆盖直接输入 URL、刷新失效 URL、客户端导航和冷启动恢复四条路径；跳转不能循环，Toast 在目标页面可见且只显示一次。
- 不改变这些页面的业务流程、路由或协议。

### [ ] Phase 8 — 综合验收与计划收尾

Branch：`test/table-ux-acceptance`

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
