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

| 阶段 | 内容                                                                                                                                              | 验收                                           | 状态 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---- |
| 0    | 规则与契约定义                                                                                                                                    | 四份规格文档定稿                               | ✅   |
| 1    | core 基建 + junk RuleSet + CLI fuzz                                                                                                               | CLI 整局 + 1 万局 fuzz 绿                      | ✅   |
| 1.5  | bloodbattle RuleSet（允许一次接口调整）                                                                                                           | 番型用例全绿 + fuzz                            | ✅   |
| 2    | server：gateway/RoomManager/托管/AI 补位（可与 1.5 并行，基于 junk）                                                                              | 4 模拟客户端整局                               | ✅   |
| 2→3  | 文档结构重构                                                                                                                                      | 新结构落地，详见 `../doc-map.md`               | ✅   |
| 3    | web：登录/大厅/牌桌（先竖切）                                                                                                                     | 浏览器真人对局                                 | ✅   |
| 4.1  | AI 补位：`packages/ai` 最简策略 + `room:addBot` + 自动出牌触发机制                                                                                | 单人开房，其余 3 座补 AI，能完整打完一局垃圾胡 | ✅   |
| 4.2  | 断线托管（复用阶段 4.1 的自动出牌基础设施）                                                                                                       | 模拟断线，房间继续跑，该座位被自动代打到局终   | ✅   |
| 4.3  | 黑暗模式（明牌模式取消，见 `decisions.md` D19）                                                                                                   | 浏览器手测：暗色主题能切换                     | ✅   |
| 4.4  | UI/操作优化：大厅/房间 UI 重做，拆成 6 个子步骤                                                                                                   | 见下方"已完成阶段"小节                         | ✅   |
| 4.5  | Replay / 明牌 Replay（内存事件日志，复用直播已有的可见性过滤逻辑 + 调试用 `getOmniscientView`）                                                   | 见下方"已完成阶段"小节                         | ✅   |
| 4.7  | Junk 牌桌 UI 重做（视觉层）：真实牌面 + 布局，参考姊妹项目 `mj-next`                                                                              | 浏览器手测：真人对局能看到布局/牌面/牌河       | ✅   |
| 5    | 持久化落地：事件日志/replay/战绩搬进 PG（重启后仍在）+ 真正的 Supabase OAuth（D16 触发条件）——原编号 4.6，从阶段 4 系列拉出单独立项（见下方说明） | 重启 server 后历史对局的 replay/战绩仍可查     | ✅\* |
| 6    | 血战到底打磨到完整可玩，复用阶段 4 沉淀的 AI/UI 框架（垃圾胡基本完成后再开工）                                                                    | 单人能对着 AI 完整打完一局血战                 |      |
| 7    | mobile（Expo，血战完成后再考虑）                                                                                                                  |                                                |      |

> \* 阶段 5 代码已完成（4 个子步骤，见下方"已完成阶段"），但 Google/GitHub 按钮点击后的完整 OAuth 跳转需要用户提供真实 OAuth Client secret 才能端到端验证，尚未验证，见下方"下一步"。
>
> 编号没有 4.6：原计划里持久化落地排在阶段 4 系列最后一项（编号 4.6），理由是"不是新功能，是让已经跑起来的东西扛得住重启"。4.1-4.5、4.7 做完后，用户决定把持久化整个拉出来单独立项为阶段 5（血战、mobile 依次顺延为 6、7）——持久化需要一个真实的 Supabase 项目（URL/anon key/PG 连接串），跟前面纯代码就能推进的子阶段性质不同，值得独立排期而不是继续算在"阶段 4 系列"里。4.6 这个编号不再使用（避免和已经出现在 commit 历史/代码注释里的"4.7"产生错位）。
>
> 阶段 4 系列拆分依据：AI 是唯一"卡住能不能玩"的一块，优先级最高、单独先做；断线托管跟 AI 共享"自动出牌"这同一套基础设施，紧跟着做；小特性大多互相独立可并行；UI/操作优化（4.4）插在小特性之后、Replay 之前——用户选择现在就逐项列出具体条目，而不是等后面阶段跑完再收集反馈。详细方案见 `phase-4-junk-complete.md`（阶段 4 系列收尾后已删除，耐久内容见 `decisions.md`/`contracts/session-mechanics.md`/本文件"已完成阶段"）。
>
> 阶段 4/6 说明：这条顺序延续阶段 2/3 定下的老规矩——先把 junk 一个玩法从"能跑通"打磨到"能完整玩"，验证一遍 AI/UI 这几层要不要按 ruleset 拆分、怎么拆；血战接入阶段 6 时应该是复用这套框架的增量工作，不是重新设计。若届时血战还要大改阶段 4 定下的框架，说明阶段 4 的设计本身有遗漏，应该回头补文档而不是默认接受重构。

## 已完成阶段

- **阶段 1**（tag `phase-1`）：TypeScript monorepo、纯函数 core、junk RuleSet、CLI 与 fuzz。契约见 `../contracts/engine-contract.md`/`../variants/junk.md`，取舍理由见 `../decisions.md`。
- **阶段 1.5**：血战 RuleSet 完整实现（换三张/定缺、声明窗口、杠分账本、抢杠胡、呼叫转移、流局结算等），同期完成 D12 接口调整。规则见 `../variants/bloodbattle.md`，契约见 `../contracts/engine-contract.md`，取舍理由见 `../decisions.md`。
- **阶段 2**（tag `phase-2`）：NestJS + Socket.IO server 落地（GameService/RoomService/EventBus/RoomsGateway），4 客户端整局验收通过。契约见 `../contracts/protocol-shared.md`/`../contracts/session-mechanics.md`，取舍理由见 `../decisions.md` D13/D14；遗留缺口见下方待办。
- **阶段 2→3**：文档结构重构，详见 `../doc-map.md`。
- **阶段 3**（tag `phase-3`）：web 登录/选玩法/大厅/牌桌竖切跑通——开发态假登录（D16）、Vite+React 技术栈（D17）、房间生命周期靠 ack 初始快照 + 事件广播增量更新驱动（架构铁律 5，不存在"重新查一次房间状态"的消息）、牌桌渲染 `PlayerViewBase` 公共骨架并对"事实型" `game:event` 做增量更新（D18）。junk 验证到能真实发出并成功执行一个 `game:action`；bloodbattle 验证到公共骨架能正确渲染（换三张/定缺属于玩法专属阶段 UI，留给阶段 6 血战）。12 个 e2e 用例（`apps/server` 5 个 + `apps/web` 7 个）已接入根目录 `pnpm verify`（此前 `turbo.json` 一直没有 `test:e2e` 任务，e2e 从未真正进过根级 DoD 链条，这次一并补上）。契约见 `../contracts/*.md`，实现细节见 `apps/web/AGENTS.md`，取舍理由见 `../decisions.md` D16-D18。
- **阶段 4.1**（AI 补位）：新增 `packages/ai`（`chooseAction`：有胡/自摸必胡，否则随机选 `getLegalActions` 里的一项，ruleset-agnostic，纯函数）并接上 tsup 双格式构建（server 是仓库唯一 CJS 包，源码级导入行不通，对齐 core/protocol 的产物形态）；`RoomService` 新增 `addBot`（仅房主、仅 `waiting` 阶段，补空位后复用 `ready()` 让 bot 立即视为已准备）与 `autoPlayBots`（真人动作后、每局开局后循环扫描 bot 座位出牌，直到轮到真人或对局结束）；gateway 加 `room:addBot` 消息；web `LobbyView` 加"补 AI"按钮（复用已有的 `room:playerJoined`/`room:readyChanged` 事件监听，未新增前端状态逻辑）。验收：`RoomService` 单测覆盖单人+3 bot 打完 4 局完整会话；`apps/web` e2e 覆盖房主单人补满 3 个 bot 座位并 start 的大厅流程。契约见 `../contracts/session-mechanics.md` §6，AI 直接跑在 server 进程里拿完整 `state`（不走 `PlayerView`-only 契约）的取舍与技术债记录见 `../decisions.md` D21。
- **阶段 4.2**（断线托管）：`RoomPlayer` 加 `isAutoPiloted` 字段；`RoomsGateway.handleDisconnect` 在 socket 断开时查出 `{roomId, userId}` 交给新增的 `RoomService.handleDisconnect`——若房间对局中，把该座位标记 `isAutoPiloted` 并立刻跑一次 `autoPlayBots`（`nextBotAction` 现在对 `isBot`/`isAutoPiloted` 一视同仁，复用同一条扫描循环，不是另起一套机制）。这个标记永不清除，MVP 没有重连恢复真人操控的路径（同一 `userId` 再 `room:join` 会被 `ALREADY_IN_ROOM` 拒绝）；等待阶段的断线不触发处理，座位原样留空。验收：`RoomService` 单测覆盖 3 个边界（未知房间/等待阶段/bot 座位都不受影响）+ 断线后单会话打完 4 局；`apps/server` e2e 新增真实 socket 断线场景（`b!.disconnect()` 后仅驱动其余 3 个真实连接，验证真的走到 `RoomsGateway` 的 `disconnect` 生命周期，不是只测 `RoomService` 方法本身）。文档：`session-mechanics.md` §8 评审点 H 标记掉线路径已实现（`room:leave` 主动离座仍未实现，两者共享托管机制只是触发入口不同）。
- **阶段 4.3**（黑暗模式）：`src/lib/theme.ts`（`getInitialTheme`/`applyTheme`，localStorage 优先、否则退回 `prefers-color-scheme`）+ `src/components/ThemeToggle.tsx`（固定右上角，本地 state，不进 Zustand）+ `main.tsx` 挂载前先应用一次避免首屏闪烁。验收：新增 e2e 用例（`theme.e2e-spec.ts`）验证切换即时生效且刷新页面后保持。原计划还包含"明牌模式"，实施中判断代价过高取消，后来以调试/测试专用逃生舱复活，完整取舍过程见 `decisions.md` D19。
- **阶段 4.4**（大厅/房间 UI 重做，6 个子步骤）：i18n（非 table 页文案全英文）；`LoginView` 换 shadcn `login-03` block；`/games` 改 junk/bloodbattle Tabs + `lobby:list` 房间列表/搜索/命名建房；`/lobby/:roomId`（原 `/lobby/:rulesetId`）改 `room:peek` 驱动的房间页，支持指定座位入座、为指定空座位加 bot；新增 `room:leave`（`waiting` 阶段房主离开删房/非房主离开清空座位，`in-game` 阶段等同断线转托管，全部真人退出自动关房）。协议新增 `lobby:list`/`room:peek`/`room:leave`、`room:playerLeft`/`room:closed` 事件、`SEAT_TAKEN` 错误码，完整契约见 `contracts/session-mechanics.md` §6。web e2e 17/17 全绿。
- **阶段 4.5**（Replay / 明牌 Replay，5 个子步骤）：`Room` 新增 `finishedGames: FinishedGameLog[]`，每局结束归档 `{gameNumber, seatUserIds, events, finalState}`；`replay:get`（正式产品功能，参与过的玩家可查，不要求当前仍在房间）复用 core 的 `rebuildPlayerView` 重建终局视图 + 过滤后事件时间轴；`debug:replayOmniscientView`（调试专用，只支持局终，直接读 `finalState` 喂 `getOmniscientView`）。web 新增 `/replay/:roomId/:gameNumber` 播放器（`ReplayView`，单步前进/后退）。过程中把 `rebuildPlayerView` 补成 `RulesetModule` 第三个 dispatch 方法（`decisions.md` D20）。完整契约见 `contracts/session-mechanics.md` §10、`contracts/protocol-shared.md` §7。
- **阶段 4.7**（Junk 牌桌 UI 重做，视觉层）：参考姊妹项目 `mj-next`（同一开发者的另一个麻将练习项目）复用其 `public/tiles/Regular/*.svg` 真实牌面素材；新增 `apps/web/src/lib/mahjongTiles.ts`（TileId→文件名映射，独立实现不 import `@new-mj/core`）、`src/lib/seatLayout.ts`、`src/store/tableLayout.ts`（`tileUnit` + `ResizeObserver`，选 store 方案而非纯 CSS container query 是因为 `apps/mobile` 未来无论如何都要用 JS 测量布局）、`src/components/mahjong/`（`Tile`/`HandRow`/`DiscardPile`/`MeldGroup`/`PlayerBadge`/`WallStack`）。`TableView` 重排成三层嵌套 CSS Grid，出牌交互不变。范围：只做 junk（bloodbattle 沿用公共骨架，D18 现状不变）、不做动画、不补 `zimo`/`anGang`/`buGang`（core PlayerView 契约缺口，见下方待办）。web e2e 17/17 全绿。
- **阶段 5**（持久化，4 个子步骤，代码完成，OAuth 端到端验证待用户提供真实 secret）：参考姊妹项目 `../ai/rag-local` 的 Supabase 方案，Prisma 放进 `apps/server`（不建独立 `packages/db`）+ `profiles`/`room_sessions`/`game_logs` 三表无 FK；`RoomService.handleGameEnd`/会话结束 fire-and-forget 归档；`replay:get`/`debug:replayOmniscientView` 内存找不到时（进程重启过）DB 兜底，两者改 `async`，`RoomsGateway` 新增 `replyAsync`；`auth.middleware.ts` 按 `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` 是否配置在真实 Supabase 校验（`auth.getUser(token)`）和 D16 开发态校验之间分支，web `LoginView` 加回 Google/GitHub 按钮（`login-03` 原有社交按钮，D16 时为配合假登录去掉过）+ 新 `/auth/callback` 路由，dev 昵称登录收进 `import.meta.env.DEV` 门控区块继续给 e2e 用。已用本地 `npx supabase start`（Docker）验证 schema/迁移/持久化读写/GoTrue 真实签发 token 的校验逻辑本身（直连 GoTrue 容器）；该沙盒的 Kong 代理层对 `/auth/v1/*` 稳定 500（与本仓库代码无关），Google/GitHub 按钮点击后的完整跳转未验证。完整契约见 `contracts/session-mechanics.md` §11，取舍记录见 `decisions.md` D22。

## 当前状态

阶段 4 系列（4.1-4.5、4.7，编号里没有 4.6，原因见上方阶段路线的说明）全部完成，已按 `../doc-map.md` §6 收尾：耐久内容吸纳进 `decisions.md`（D19-D21）、`contracts/session-mechanics.md`（§10 新增）、`contracts/protocol-shared.md`（§7 新增消息）与本文件"已完成阶段"，`phase-4-junk-complete.md`/`phase-4.4-lobby-room-ui.md`/`phase-4.5-replay.md` 三份过程文档已删除。`TableView` 缺 `zimo`/`anGang`/`buGang` 按钮（阶段 3 竖切遗留缺口，4.5 验证 replay 时发现）仍是已知待办，见下方"待办"。

阶段 5（持久化 + 真正的 Supabase OAuth）代码已完成并提交（4 个子步骤），耐久内容已吸纳进 `decisions.md` D22、`contracts/session-mechanics.md` §11、`contracts/protocol-shared.md` §4、`architecture/data-model.md` §3、`architecture/system.md`。本沙盒用本地 `supabase start` 验证了 schema/持久化读写/GoTrue 真实 token 校验逻辑，但没能验证经 Kong 代理的完整 `/auth/v1/*` 请求（该沙盒 Kong 层的环境问题，非代码问题）以及 Google/GitHub 按钮点击后的真实 OAuth 跳转（需要用户提供的真实 OAuth Client secret）。

**下一步第一个动作**：等用户提供真实 Supabase 项目 URL/anon key/service role key，以及 Google/GitHub OAuth Client ID/Secret（填进 `.env`，参考 `.env.example`），端到端验证一遍登录→大厅→牌桌的真实 OAuth 流程，确认无误后阶段 5 正式收尾（按 `../doc-map.md` §6）；OAuth secret 到位前，可以先开始阶段 6 血战到底的打磨（两者互不阻塞）。

## 待办

- [ ] 阶段 4：协议补 nickname 字段（`room:create`/`room:join` payload 目前没有，`apps/server` 用 userId 派生占位昵称）——界面优化免不了要用真实昵称
- [ ] 阶段 7 前：mobile 具体路线（是否 react-native-web 统一）
- [ ] 真人协作触发时：repo 权限、是否上分支保护
- [ ] 日麻立项时：按 `../architecture/variant-boundary.md` §2 走一次边界复审，重点是庄家轮换公式与会话排名策略两条"待验证"条目
- [ ] `TableView` 补 `zimo`/`anGang`/`buGang` 的 UI 入口（阶段 3 竖切遗留缺口，4.5 步骤 4 验证 replay 时发现：目前纯点击可能卡在只能自摸/补杠却没按钮的状态，打不完一整局）
