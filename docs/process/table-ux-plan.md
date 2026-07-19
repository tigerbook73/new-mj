# Junk Table UX 分阶段实施计划

> 状态：Phase 0 已完成，等待用户授权本地 squash merge。
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
2. 开工先读 `plan.md` 状态区，再只细化当前 Phase 的实现清单、接口、风险和验收。若细化时出现新的架构级选择，暂停并提请用户决定。
3. 实现与测试同阶段完成；先跑定向检查，阶段门统一执行根目录 `pnpm verify`。
4. 收工时更新本文件与 `plan.md`，记录验证结果和下一步首个动作，然后允许自动提交。
5. 提交后必须停止并报告 branch、commit、验证结果和风险；**不得自动 merge、不得创建 PR、不得自动推送**。
6. 只有用户明确要求 merge 后，才在本地把该 branch squash merge 到 `main`；成功后可删除本地阶段分支。下一 Phase 再从新的 `main` 开始。

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

### 3.3 可配置声明超时

- `ConfigService.claimTimeoutMs` 读取 `CLAIM_TIMEOUT_MS`，默认 `5000` 毫秒。
- 只接受正整数；缺失、空值、非数字、零或负数回退默认值。
- 调试可设很长，例如 `CLAIM_TIMEOUT_MS=3600000`；测试可设很短。
- server 计算绝对 deadline，客户端只展示，不在本地计时结束时自行提交动作。
- 玩家响应、窗口解决、牌局结束、房间关闭或新窗口替换旧窗口时必须清理定时器；到期通过正常动作路径提交 `{ type: "pass" }`。

## 4. Phases

### [x] Phase 0 — 计划文档重置

Branch：`docs/table-ux-plan-reset`

完成内容：

- 新建本专题计划，固定阶段、公共接口、验收门和本地 squash 工作流。
- 重写总 plan：合并已完成能力，移除旧阶段编号和修复流水账，把 bloodbattle/mobile 等转入待办。
- 删除已完成的 `auth-session-profile-fix-plan.md`，D28 耐久结论继续由现有 contracts/decisions 承载。

阶段验收（2026-07-19）：

- `git diff --check`：通过。
- `pnpm exec prettier --check docs/process/plan.md docs/process/table-ux-plan.md`：通过。
- D28 吸纳审计：断线宽限、账号仲裁与 server-truth 恢复均已由 `contracts/session-mechanics.md` 和 `decisions.md` D25–D28 承载，无残留旧计划引用。
- `pnpm verify`：通过；format/typecheck/lint/build/unit/e2e 全绿，web Playwright 24 条、server e2e 21 条通过，core 包含 1000 局 junk 与 10000 局 bloodbattle fuzz。

### [ ] Phase 1 — 权威逐动作快照

Branch：`feat/table-authoritative-snapshots`

目标：

- 更新协议/会话契约，server 每个已接受动作后为仍连接的座位生成 PlayerView 与 seq 并单播 snapshot。
- web store 保存 seq，只接受不旧于当前状态的 snapshot。
- 移除 web 对规则型事件的状态推导；保留事件作为下一阶段动画输入。
- 覆盖多事件动作、bot 连续动作、重连和旧 snapshot 丢弃。

开工前细化重点：snapshot 生成时点、bot 链的逐步发送顺序、局终/切局的重复快照边界，以及 store 中 event/snapshot 暂存形状。

### [ ] Phase 2 — 可配置声明窗口超时

Branch：`feat/table-claim-timeout`

目标：

- 实现 `CLAIM_TIMEOUT_MS` 解析、声明窗口 deadline、每座位响应 timer 与可靠清理。
- deadline 随对应座位的 event/snapshot 发送；超时 pass 走与主动 pass 相同的 RoomService 路径。
- 使用 fake timers 覆盖主动响应、部分响应、多玩家同时到期、窗口提前解决、房间关闭与重复 timer 防护。

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

- 建立非权威事件动画队列，覆盖摸牌、出牌、吃碰杠胡、回合、牌墙变化和结算。
- 动画结束后提交对应 snapshot；积压、失焦恢复和重连时快速追平最新权威状态。
- `prefers-reduced-motion` 下跳过位移动画但保留状态反馈。

### [ ] Phase 7 — 全站视觉与体验统一

Branch：`feat/web-visual-refresh`

目标：

- 将牌桌设计系统应用到登录、游戏选择、大厅、房间和 Replay。
- 统一布局、间距、层级、按钮、加载/空/错状态和明暗主题，并接通现有 ThemeToggle。
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
