# plan：阶段路线与状态

> 过程性文档：阶段状态与待办在此维护，收尾清理。需求与架构见 `../architecture/*.md` / `../decisions.md`。
> 阶段记录约定：当期工作简单时，直接在对应阶段小节记结论 + 验收；复杂到需要分步规划时，本文件只留阶段摘要与状态，详细方案另开文档（设计草案/Project 讨论），定案或完成后再把结论摘要回填——不把推演过程整篇搬进本文件，分流规则见 `../doc-map.md` §5。

## 需求（不变基线）

1. Web + 移动端 App
2. 多玩法：垃圾胡（第一，验证架构）→ 血战到底（第二）→ 后续扩展
3. AI 与真人混桌（必须有真人）
4. 多局并行
5. Google/GitHub 登录
6. 架构可扩展即可，允许有边界重构
7. 非商用，不做数据兼容（可清对局表，保用户表，单向引用 userId）

## 阶段路线

| 阶段 | 内容                                                                                    | 验收                                           | 状态 |
| ---- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | ---- |
| 0    | 规则与契约定义                                                                          | 四份规格文档定稿                               | ✅   |
| 1    | core 基建 + junk RuleSet + CLI fuzz                                                     | CLI 整局 + 1 万局 fuzz 绿                      | ✅   |
| 1.5  | bloodbattle RuleSet（允许一次接口调整）                                                 | 番型用例全绿 + fuzz                            | ✅   |
| 2    | server：gateway/RoomManager/托管/AI 补位（可与 1.5 并行，基于 junk）                    | 4 模拟客户端整局                               | ✅   |
| 2→3  | 文档结构重构                                                                            | 新结构落地，详见 `../doc-map.md`               | ✅   |
| 3    | web：登录/大厅/牌桌（先竖切）                                                           | 浏览器真人对局                                 | ✅   |
| 4.1  | AI 补位：`packages/ai` 最简策略 + `room:addBot` + 自动出牌触发机制                      | 单人开房，其余 3 座补 AI，能完整打完一局垃圾胡 | ✅   |
| 4.2  | 断线托管（复用阶段 4.1 的自动出牌基础设施）                                             | 模拟断线，房间继续跑，该座位被自动代打到局终   | ✅   |
| 4.3  | 黑暗模式（明牌模式已取消，见下）                                                        | 浏览器手测：暗色主题能切换                     | ✅   |
| 4.4  | UI/操作优化：用户逐项描述具体条目，收集中，未收尾前内容不当定案                         | 待条目收集完毕后补充                           |      |
| 4.5  | Replay / 明牌 Replay（内存事件日志，复用直播已有的可见性过滤逻辑）                      |                                                |      |
| 4.6  | 持久化落地：事件日志搬进 PG（重启后 replay/战绩仍在）/ 战绩查询 / 真正的 Supabase OAuth |                                                |      |
| 5    | 血战到底打磨到完整可玩，复用阶段 4 沉淀的 AI/UI/持久化框架（垃圾胡基本完成后再开工）    | 单人能对着 AI 完整打完一局血战                 |      |
| 6    | mobile（Expo，血战完成后再考虑）                                                        |                                                |      |

> 阶段 4 系列拆分依据：AI 是唯一"卡住能不能玩"的一块，优先级最高、单独先做；断线托管跟 AI 共享"自动出牌"这同一套基础设施，紧跟着做；小特性大多互相独立可并行；UI/操作优化（4.4）插在小特性之后、Replay 之前——用户选择现在就逐项列出具体条目，而不是等后面阶段跑完再收集反馈；Replay 依赖"先有事件日志"但不需要等 PG，先做内存版；持久化不是新功能，是让已经跑起来的东西"扛得住重启"，放最后。详细方案见 `phase-4-junk-complete.md`。
>
> 阶段 4/5 说明：这条顺序延续阶段 2/3 定下的老规矩——先把 junk 一个玩法从"能跑通"打磨到"能完整玩"，验证一遍 AI/UI/持久化这几层要不要按 ruleset 拆分、怎么拆；血战接入阶段 5 时应该是复用这套框架的增量工作，不是重新设计。若届时血战还要大改阶段 4 定下的框架，说明阶段 4 的设计本身有遗漏，应该回头补文档而不是默认接受重构。

## 已完成阶段

- **阶段 1**（tag `phase-1`）：TypeScript monorepo、纯函数 core、junk RuleSet、CLI 与 fuzz。契约见 `../contracts/engine-contract.md`/`../variants/junk.md`，取舍理由见 `../decisions.md`。
- **阶段 1.5**：血战 RuleSet 完整实现（换三张/定缺、声明窗口、杠分账本、抢杠胡、呼叫转移、流局结算等），同期完成 D12 接口调整。规则见 `../variants/bloodbattle.md`，契约见 `../contracts/engine-contract.md`，取舍理由见 `../decisions.md`。
- **阶段 2**（tag `phase-2`）：NestJS + Socket.IO server 落地（GameService/RoomService/EventBus/RoomsGateway），4 客户端整局验收通过。契约见 `../contracts/protocol-shared.md`/`../contracts/session-mechanics.md`，取舍理由见 `../decisions.md` D13/D14；遗留缺口见下方待办。
- **阶段 2→3**：文档结构重构，详见 `../doc-map.md`。
- **阶段 3**（tag `phase-3`）：web 登录/选玩法/大厅/牌桌竖切跑通——开发态假登录（D16）、Vite+React 技术栈（D17）、房间生命周期靠 ack 初始快照 + 事件广播增量更新驱动（架构铁律 5，不存在"重新查一次房间状态"的消息）、牌桌渲染 `PlayerViewBase` 公共骨架并对"事实型" `game:event` 做增量更新（D18）。junk 验证到能真实发出并成功执行一个 `game:action`；bloodbattle 验证到公共骨架能正确渲染（换三张/定缺属于玩法专属阶段 UI，留给阶段 5）。12 个 e2e 用例（`apps/server` 5 个 + `apps/web` 7 个）已接入根目录 `pnpm verify`（此前 `turbo.json` 一直没有 `test:e2e` 任务，e2e 从未真正进过根级 DoD 链条，这次一并补上）。契约见 `../contracts/*.md`，实现细节见 `apps/web/AGENTS.md`，取舍理由见 `../decisions.md` D16-D18。
- **阶段 4.1**（AI 补位）：新增 `packages/ai`（`chooseAction`：有胡/自摸必胡，否则随机选 `getLegalActions` 里的一项，ruleset-agnostic，纯函数）并接上 tsup 双格式构建（server 是仓库唯一 CJS 包，源码级导入行不通，对齐 core/protocol 的产物形态）；`RoomService` 新增 `addBot`（仅房主、仅 `waiting` 阶段，补空位后复用 `ready()` 让 bot 立即视为已准备）与 `autoPlayBots`（真人动作后、每局开局后循环扫描 bot 座位出牌，直到轮到真人或对局结束）；gateway 加 `room:addBot` 消息；web `LobbyView` 加"补 AI"按钮（复用已有的 `room:playerJoined`/`room:readyChanged` 事件监听，未新增前端状态逻辑）。验收：`RoomService` 单测覆盖单人+3 bot 打完 4 局完整会话；`apps/web` e2e 覆盖房主单人补满 3 个 bot 座位并 start 的大厅流程。契约见 `../contracts/session-mechanics.md` §6，取舍与技术债记录见 `phase-4-junk-complete.md`。
- **阶段 4.2**（断线托管）：`RoomPlayer` 加 `isAutoPiloted` 字段；`RoomsGateway.handleDisconnect` 在 socket 断开时查出 `{roomId, userId}` 交给新增的 `RoomService.handleDisconnect`——若房间对局中，把该座位标记 `isAutoPiloted` 并立刻跑一次 `autoPlayBots`（`nextBotAction` 现在对 `isBot`/`isAutoPiloted` 一视同仁，复用同一条扫描循环，不是另起一套机制）。这个标记永不清除，MVP 没有重连恢复真人操控的路径（同一 `userId` 再 `room:join` 会被 `ALREADY_IN_ROOM` 拒绝）；等待阶段的断线不触发处理，座位原样留空。验收：`RoomService` 单测覆盖 3 个边界（未知房间/等待阶段/bot 座位都不受影响）+ 断线后单会话打完 4 局；`apps/server` e2e 新增真实 socket 断线场景（`b!.disconnect()` 后仅驱动其余 3 个真实连接，验证真的走到 `RoomsGateway` 的 `disconnect` 生命周期，不是只测 `RoomService` 方法本身）。文档：`session-mechanics.md` §8 评审点 H 标记掉线路径已实现（`room:leave` 主动离座仍未实现，两者共享托管机制只是触发入口不同）。
- **阶段 4.3**（黑暗模式；明牌模式取消，见下）：`src/lib/theme.ts`（`getInitialTheme`/`applyTheme`，localStorage 优先、否则退回 `prefers-color-scheme`）+ `src/components/ThemeToggle.tsx`（固定右上角，本地 state，不进 Zustand）+ `main.tsx` 挂载前先应用一次避免首屏闪烁。验收：新增 e2e 用例（`theme.e2e-spec.ts`）验证切换即时生效且刷新页面后保持。

## 当前状态

阶段 4 系列的前三个子阶段（4.1 AI 补位、4.2 断线托管、4.3 黑暗模式）已完成，4.4（UI/操作优化）定案为"大厅/房间 UI 重做"，拆成 6 个子步骤，详细方案见 `phase-4.4-lobby-room-ui.md`（阶段 4 系列收尾后按 `../doc-map.md` §6 吸纳耐久内容并删除）。

**下一步第一个动作**：阶段 4.5 Replay——先盘点现有内存事件流与可见性过滤边界，确定 replay 日志的最小记录形状。

本次收尾：`packages/protocol` schema 已按 common、room models/requests/events、game、auth 拆分，公共导出与协议行为不变。`pnpm verify` 全绿。

后续收尾：仓库内没有 `src/schemas.ts` 的生产代码依赖，已删除该兼容性 barrel；schema 测试改从 `src/index.ts` 公共入口导入，迁移前的 32 个测试当时全绿。

本次重构：protocol 单元测试已按 `src` 下的模块 colocate（common/auth/room-models/room-requests/room-events/game），补充模型、请求和事件边界用例；package 的 typecheck/lint 仅扫描 `src`，`pnpm verify` 全绿。

**阶段 4.4.3 + 4.4.5**：已完成。`/games` 改为 junk/bloodbattle Tabs，接入 `lobby:list` 房间列表、搜索、命名建房；`/lobby/:roomId` 改为 `room:peek` 驱动的房间页，支持指定座位入座、指定空座位加 bot、ready/start，并保留 ack + 事件广播状态边界。web e2e 9/9 全绿（含 table 验收迁移到新大厅流程）。

**阶段 4.4.6**：已完成。等待阶段和 table 页均提供 `Leave room`；等待阶段非房主离开释放座位，房主离开关闭房间并把其他玩家带回大厅显示提示；对局中离开复用 `room:leave` 的托管路径，其他真人继续留在牌桌。房主仅在仍有其他玩家时需要确认，普通玩家、observer 与独自离开的房主直接离开。房间页补充 owner、真人成员头像/tooltip、observer 实时进入离开同步，并明确 BOT 不加入成员列表。web e2e 17/17 全绿。

> 4.3/4.4 范围调整：原计划里的"界面/操作优化"一开始没有具体条目（用户原话只圈定了"纯 UI、不涉及后端"这个边界），先决定拆出去推迟到有具体反馈再排期；随后用户改主意，改为单独立项为 4.4，由用户逐项描述具体内容——最终定案为 6 条（i18n / `login-03` / 标签页大厅 / 协议+server 加座位选择与 `room:leave` / 大厅列表+房间页 / 离开房间），table 页重做明确排除在外。原 4.4 Replay / 4.5 持久化各自顺延为 4.5 / 4.6。
>
> **明牌模式取消**：实现过程中发现"打的时候看到墙牌"这个要求，其实比原计划设想的"gateway 跳过可见性过滤"深得多——查 core 代码发现墙里还没摸到的牌从来不出现在任何事件里，要做到"提前看到未摸的墙牌"必须新增一个 core 能力（`getOmniscientView`，会动到 `engine-contract.md` 里"冻结的四签名"之外的契约面）。已经完整实现过一版（core 的 junk/bloodbattle 两个 ruleset + protocol schema + server 部分接线），跑通 `pnpm --filter @new-mj/core verify`；用户权衡后决定这个复杂度不值得，整版撤销（`git restore`，未提交过，工作区干净），4.3 收窄为只做黑暗模式。

## 待办

- [ ] 阶段 4：协议补 nickname 字段（`room:create`/`room:join` payload 目前没有，`apps/server` 用 userId 派生占位昵称）——界面优化免不了要用真实昵称
- [ ] 阶段 6 前：mobile 具体路线（是否 react-native-web 统一）
- [ ] 真人协作触发时：repo 权限、是否上分支保护
- [ ] 日麻立项时：按 `../architecture/variant-boundary.md` §2 走一次边界复审，重点是庄家轮换公式与会话排名策略两条"待验证"条目
