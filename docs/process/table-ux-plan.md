# Junk Table UX 分阶段实施计划

> 状态：现状基线（协议/快照/声明超时/AI advice/桌面视觉骨架）已完成并合入 main，见 §4。新计划**先做完桌面端完整功能**，手机横屏/竖屏移入 `plan.md` 待办，暂不纳入本文件的阶段序列。Phase 1 的 Step 0/1a 已在阶段分支完成并验证，等待用户 merge；1b 按用户要求留待其自行规划，不阻塞本阶段。
>
> 本文件保存专题设计、阶段依赖、阶段细化内容与验收记录；`plan.md` 只保留总进度、当前阶段和下一步第一个动作。

## 1. 目标与边界

本专题把垃圾胡 Table 打磨成完整产品体验：桌面 Web 全屏无页面滚动、核心对局内容不裁切、合法动作完整可操作、AI 给出一个合法推荐、server 提供可配置声明超时、客户端按权威快照同步并播放事件动画，同时把现代麻将桌视觉系统推广到其他 Web 页面。**手机横屏/竖屏适配移出本轮范围**，见 `plan.md` 待办——先在桌面端把功能做完整、跑通 `../architecture/frontend-layout.md` 的 Zone/LayoutPreset schema，再决定何时启动手机端。

边界：

- 只完整验收垃圾胡；bloodbattle 只保证公共骨架不回归，换三张/定缺等进入总待办。
- UI 延续现有英文，本专题不做国际化。
- AI 第一版只推荐一个合法动作，不承诺向听、牌效分数或解释。
- 声明窗口与普通摸打回合使用独立 server timer；普通回合的 10 秒自动出牌在 Phase 4 落地。
- 本轮不加入音效。
- 本轮只覆盖桌面视口（1440×900、1366×768）；手机视口（844×390、390×844）不在验收范围内。

## 2. 阶段工作流

本专题经用户明确确认，临时覆盖 `workflow.md` 的 trunk-based 默认方式：

1. 每个 Phase 必须从最新本地 `main` 创建独立 branch；前一 Phase 未合并不得开始后一 Phase。
2. 开工先读 `plan.md` 状态区，再只细化当前 Phase 的实现清单、接口、风险和验收。详细计划完成后更新两份 tracker、形成规划检查点提交并强制暂停；**只有用户明确确认该 Phase 计划后才能开始测试和实现**。
3. 若细化时出现新的架构级选择，同样暂停并提请用户决定，不能用规划检查点绕过架构护栏。
4. 获得计划确认后，实现与测试同阶段完成；先跑定向检查，阶段门统一执行根目录 `pnpm verify`。
5. 收工时更新本文件与 `plan.md`，记录验证结果和下一步首个动作，然后允许自动提交。
6. 实现提交后必须停止并报告 branch、commit、验证结果和风险；**不得自动 merge、不得创建 PR、不得自动推送**。
7. 只有用户明确要求 merge 后，才在本地把该 branch squash merge 到 `main`；成功后把最终 `Merge commit` 写入该 Phase 的固定字段并形成 tracker 提交，随后可删除本地阶段分支。下一 Phase 再从新的 `main` 开始，并重新经过"详细计划→用户确认"门。

状态约定：`[ ] pending`、`[~] in progress`、`[x] completed`、`[!] blocked`。

## 3. 公共接口决策

### 3.1 AI advice

- 查询 `game:advice {}`。
- ack data：`{ seq: number, deadline?: number, actions: unknown[], recommendedActionIndex?: number }`。
- server 只根据握手绑定座位取得 `PlayerView + getLegalActions`，再调用 `packages/ai`；payload 不包含也不信任 userId/seat。
- `packages/ai` 的 `recommendAction(playerView, legalActions)`：推荐必须来自 legalActions，只消费该座位可见信息。
- web 只接受与当前 seq 匹配的 advice；动作数组由 core 决定合法性，web 只分组、展示和提交。

### 3.2 权威快照与动画

- `game:snapshot` 保持 `{ view, seq, deadline? }` 形状，语义为每个真人、bot 或超时代提交动作后的逐座位权威状态。
- 同一连接按"可见 game events → 覆盖这些 events 的 snapshot"发送。
- event 只驱动动画；snapshot 始终是最终状态权威。重连直接采用最新 snapshot，不重播历史动画。
- Phase 5（事件驱动牌桌动画）使用双状态与动画屏障：新 snapshot 立即进入 `authoritativeSnapshot`，但只有对应 event 动画完成后才提交为 Table 渲染和可操作性所读的 `presentedView`；可选动作、AI 建议和按钮不得直接读取尚未呈现的权威状态。
- 动画期间锁定操作并按 seq 排队；重连、页面恢复、队列过长或 reduced-motion 时允许跳过动画，直接把最新权威 snapshot 提交到 `presentedView`。

### 3.3 可配置声明超时

- `ConfigService.claimTimeoutMs` 读取 `CLAIM_TIMEOUT_MS`，默认 `5000` 毫秒。
- 只接受正整数；缺失、空值、非数字、零或负数回退默认值。
- server 计算绝对 deadline，客户端只展示，不在本地计时结束时自行提交动作。
- 玩家响应、窗口解决、牌局结束、房间关闭或新窗口替换旧窗口时必须清理定时器；到期通过正常动作路径提交 `{ type: "pass" }`。

## 4. 现状基线

以下能力已完成、测试覆盖、并合入 `main`，不再是本计划的执行项，只作为后续阶段的既定基础：

- **协议与会话**：权威逐动作快照（`game:snapshot` 每个动作后逐座位下发，web 用统一入口 `applyGameSnapshot`，merge commit `18416f9`）；可配置声明窗口超时（`CLAIM_TIMEOUT_MS`，server 计时代提交 pass，merge commit `39f93b2`）；AI Advice 数据链路（`game:advice` 查询，AI 只消费 PlayerView+legalActions，merge commit `9a5d254`）。三者的协议形状仍是当前公共契约，见 §3。
- **桌面视觉骨架**（merge commit `cda9286`）：1440×900/1366×768 视口下的现代麻将桌视觉——`TableHud`/`TableBoard`/`CenterStatus` 组件切分、手牌显示排序（万→筒→条→字牌，各组内从小到大，只排序渲染副本不改 `PlayerView.hand`）、Tile Storybook、开发态 Layout Lab（`/dev/table-layout`）、正式 Table 接入。`justDrawn` 摸牌钉住列见 `../variants/junk.md` §7；round-end 确认门见 `../contracts/session-mechanics.md` §6；tile 尺寸计算取舍见 `../decisions.md` D29。完整组件/代码地图见 `apps/web/AGENTS.md`。
- **已知技术债**：`PlayerBadge` 全量信息（头像/庄家/托管/比分）尚未迁入 `MeldInfoTrack` 的信息列，目前信息列只是占位昵称文字（见 `plan.md` 待办）。

## 5. Phase 1 — 几何数据层 + 桌面迁移 + 布局工具

Branch：`feat/table-layout-schema`

Merge commit：待合并

目标：不新增可见 UI；按 `../architecture/frontend-layout.md` 提出的 Zone/LayoutPreset schema 重写现有桌面（1440×900/1366×768）渲染路径，验证"一个玩法+一个布局"能在新架构下端到端跑通且视觉零变化；同时产出/升级布局工具。放弃原计划里"每个 layoutMode 各自摸索一套扁平 config"的做法（`TableLayoutConfig` 与已废弃的横屏 draft `DraftLabConfig` 是这个问题的具体例证）。手机端 layoutMode 移出本轮范围（见 §1），本阶段的 schema/工具设计不因此走捷径——两个视口本身仍需要 schema 正确表达旋转与区域划分，只是不为手机横屏/竖屏另起 LayoutPreset。

实施步骤：

1. **Step 0（已完成）**：定义 `Zone`/`LayoutPreset` TS 类型（中心锚点、本地坐标、`rotationDeg` 语义——只有座位根 Zone 设非零值、`arrangement` 的 flex/grid/absolute 三态、嵌套 children）+ 一个纯函数渲染翻译组件（消费 Zone 树产出 CSS/DOM，只认坐标不认业务）。单测覆盖：90 度整数倍时宽高互换、子级坐标不受父级旋转角度影响（只随 CSS 层叠继承，不重复相加）、`localSize`+`rotationDeg` → 最终尺寸的推导规则。
2. **Step 1a / 1b（契约定下后互不阻塞，可穿插进行）**：
   - 1a（已完成）：把现有 `TableLayoutConfig`（`apps/web/src/lib/tableLayoutLab.ts`）的数值手工翻译成一份桌面 `LayoutPreset` 数据（不依赖工具存在），改造 `TableBoard`/`HandTrack`/`MeldInfoTrack`/`DiscardPile` 消费 Zone 树而不是各自的 `%` prop；用既有桌面 Playwright 回归验证零可感知变化（纯重构，不是视觉改版）。
   - 1b（延后，不阻塞）：把 `/dev/table-layout` 升级/替换为能编辑并导出 `LayoutPreset` JSON 的工具；按用户要求由用户后续自行规划，本阶段不实现也不作为验收条件。

验证：

- [x] `pnpm --filter @new-mj/web verify`（typecheck/lint/unit/e2e/build/build-storybook）全绿；33 个 unit、28 个 Playwright 全部通过。
- [x] 既有 Layout Lab/桌面布局 Playwright 回归通过；本次为纯重构，未引入可见 UI。
- [x] 2026-07-21 根目录 `pnpm verify` 全绿（format/typecheck/lint/build/unit/e2e，包含 core junk 1000 局与 bloodbattle 10000 局 fuzz）。阶段提交后停在 `feat/table-layout-schema`，等待用户 merge 指令。

## 6. Phase 2 — 视觉与覆盖层

Branch：待定

目标（占位，Phase 1 完成后细化）：建立翡翠绿、暖金和深色中性 chrome 的统一 table token（桌面视口）；离桌、设置、事件日志、dev debug 放入浮层/抽屉；结算改为正式结果面板。

## 7. Phase 3 — 桌面视口回归验收

Branch：待定

目标（占位，Phase 2 完成后细化）：扩展 Table Playwright，同一真实 Junk 对局验收 1440×900、1366×768 两个桌面视口，断言无滚动、board 完整位于 viewport、核心元素无裁切；覆盖菜单抽屉、Leave 确认、dev debug、结算面板与 replay 链接；light/dark 各检查一次 table token 生效。

## 8. Phase 4 — 完整操作 Dock 与 AI 推荐

Branch：`feat/table-action-dock`

Merge commit：待合并

目标：

- 展示全部 junk 合法动作，补齐 `zimo/anGang/buGang`；按出牌、吃、碰、杠、胡、过分组并支持组合子选项。
- AI 推荐动作、组合和弃牌默认选中；用户可以改选。
- 所有动作统一采用"选择后确认"；请求期间防重复输入，snapshot 后清空，失败时恢复。
- 展示 server deadline 倒计时；本地归零只进入等待状态。
- 新增普通出牌回合 timer：`DISCARD_TIMEOUT_MS` 默认 10000ms，配置校验与调试长值规则对齐 `CLAIM_TIMEOUT_MS`；只在当前真人具有合法 discard 时由 server 计时，超时从 `getLegalActions` 过滤 discard 后提交最后一项，仍走正常 `runAction`。声明窗口继续使用独立 claim deadline。
- 普通出牌 deadline 同样由 server 下发并在 Dock 展示；本地归零只锁定操作并等待权威 snapshot，不自行 discard。主动出牌、回合切换、托管、局终、切局和房间关闭必须清理 timer，旧回调不得跨上下文出牌。
- 支持键盘、触屏命中区、焦点、禁用与错误反馈。
- 把 `TableView.tsx` 现在内联的 socket 订阅/派生/派发逻辑抽成集中的会话控制器，展示组件不直接碰 socket/协议（`../architecture/frontend-layout.md` §8 动作/逻辑层）。

## 9. Phase 5 — 事件驱动牌桌动画

Branch：`feat/table-event-animations`

Merge commit：待合并

目标：

- 建立 `authoritativeSnapshot`/`presentedView` 双状态与非权威事件动画队列，覆盖摸牌、出牌、吃碰杠胡、回合、牌墙变化和结算。
- 动画期间锁定操作；动画结束后才提交对应 snapshot 并展示其中的可选动作，防止下一状态按钮早于动画出现；积压、失焦恢复和重连时快速追平最新权威状态。
- `prefers-reduced-motion` 下跳过位移动画但保留状态反馈。
- 跨区域动画复用 `TileId` 作为 Motion `layoutId`；引入动画调度/降级层（`../architecture/frontend-layout.md` §6/§7）。

## 10. Phase 6 — 全站视觉与体验统一

Branch：`feat/web-visual-refresh`

Merge commit：待合并

目标：

- 将牌桌设计系统应用到登录、游戏选择、大厅、房间和 Replay。
- 统一布局、间距、层级、按钮、加载/空/错状态和明暗主题，并接通现有 ThemeToggle。
- 建立全局 Toast 与路由错误恢复：访问已不存在/无权进入的 lobby、table 或 replay URL 时，不直接渲染 `ROOM_NOT_FOUND` 等协议错误字样，而是显示用户可读 Toast 后按会话状态跳转到可用页面；访问未匹配路由时同样用 Toast 替代裸 `404 Not Found`，已登录回 `/games`，未登录回 `/login`。
- 覆盖直接输入 URL、刷新失效 URL、客户端导航和冷启动恢复四条路径；跳转不能循环，Toast 在目标页面可见且只显示一次。
- 不改变这些页面的业务流程、路由或协议。

## 11. Phase 7 — 综合验收与计划收尾

Branch：`test/table-ux-acceptance`

Merge commit：待合并

目标：

- 验收真人 + AI 垃圾胡完整流程：刷新/断线恢复、声明超时、全部动作、结算与 Replay。
- 完成桌面视口（1440×900、1366×768）、键盘、触屏、明暗主题、reduced-motion 和慢网络验收。
- 执行根 `pnpm verify`，记录结果并按 `../doc-map.md` §6 将耐久内容吸纳进 contracts/architecture/decisions/AGENTS。
- 总 plan 更新为完成状态；评估是否启动手机横屏/竖屏（`plan.md` 待办），写下下一个待办的首个动作；清理本文件中不再有价值的推演细节。

## 12. 全局验收门

每个 Phase 都必须满足：

- 实现与测试在同一阶段 branch。
- 定向测试通过，根目录 `pnpm verify` 全绿。
- `plan.md` 与本文件准确记录阶段状态、验证结果和下一步第一个动作。
- 工作树除该阶段预期内容外干净，形成提交后停止。
- 未收到用户明确 merge 指令时，main、其他 branch 和远端状态均不得改变。
