# 项目状态与当前工作

> 工作台，不是项目年表。只保留当前专题、会阻塞它的风险和有序 Backlog；完成专题压成一行，耐久结论分流到 contracts 或 architecture。

## 当前工作

**专题：垃圾胡扩展规则**

- 目标：连庄（庄家胡牌后继续坐庄，庄家胡牌结算倍率 ×2）、首局随机庄家；杠开 ×2（连续杠开连续翻倍）；混一色 ×2、清一色 ×4、七小对 ×2、碰碰胡 ×2、门清 ×2，全部番型相乘叠加。
- 进度：Claude Project 已确认首局庄家是 RuleSet 的确定性扩展点；`computeInitialDealer(seed)`、Junk v3 番型/计分、赢家坐庄、流局时逆时针轮到打牌下家和既有玩法兼容性已写入契约与规则文档。
- 下一步第一个具体动作：在 core 为三个 RuleSet 和顶层 engine 加 `computeInitialDealer(seed)`，并让 Room 在首局创建前调用它。

## 当前风险 / 开放问题

- 配置项若会改变规则、算分或 AI 算法，必须排除在此功能范围外；这类需求应另行立项并先更新契约/设计文档。
- 已发现（与本次改动无关，未修复）：`apps/web/test/lobby.e2e-spec.ts` 的 "leaving an in-game room keeps the other human in the match" 与 "force exiting an in-game room ends the session for every player" 两个用例在跑完整 `test/lobby.e2e-spec.ts` 套件时容易超时（等待对话框里的 "Hand off to AI"/"Force exit" 按钮），单独跑或小范围跑均能稳定通过；已在纯净 main（无本次任何改动）上复现，确认是套件层面的既有抖动，不是本次引入的回归。谁下次碰 leave-room/force-exit 相关代码时应该顺手看一眼。
- `hangzhou.md` §14 记录了两处不阻塞定稿的实现细节假设（财神替代数量上限、`caiPiaoCount` 中途清零与否），已按文档默认值实现并写入 fixture；如果和你的预期不符，后续只需改一行。
- 已修复：`CenterStatus` 的裁切问题——`CenterStatus` 已经整个重排为图标化卡片（状态徽标/剩余牌数英雄数字/连庄 chip/徽标行），不再用逐行 `ScaleText` 长句，原来的裁切场景不复存在；`error` 那一行仍用 `ScaleText`，长错误信息理论上还会有同样的裁切风险，但范围比之前小很多，不再单独跟踪。
- 已发现且已修复（杭州 + junk）：`getLegalActions`/`applyAction` 里的 `zimo` 合法性判定原来只检查 `isWin(state, seat)`，没检查"这一家是不是刚摸完牌"——碰/吃之后剩余的手牌恰好已经自成一手（比如碰之前手里已经是 3 副刻子+一对+一副多余的对子）时，会在没摸牌的情况下错误地把自摸也列为合法动作。两个玩法都已加 `canZimo`（要求 `state.justDrawn?.seat===seat`）修正，配套复现用例（含明杠必须先摸牌、暗杠补牌后自摸合法两条边界）均已入库；junk 是我写杭州时照抄骨架带过来的既有 bug，这次一并修了。
- 已发现且已修复（仅 junk）：junk 的 `isWin` 原来把手牌+所有副露牌铺平后交给 `lib/win.ts` 的 `isStandardWinningHand` 判定，这个函数要求铺平后的总张数严格等于"副露数×3+2"；但任何一种杠（暗杠/明杠/补杠）在副露里都是 4 张实体牌而不是 3 张，一旦手里报过杠，这个总数再也凑不出"能整除"的形状，`isWin` 会永远返回 false——即**junk 里报过杠之后，那一手牌不管自摸还是点炮都再也胡不了**。血战到底和杭州都不会中招，因为它们的 `isWin` 复用的是"副露数量记 1 个字，不管物理张数"的番型判定（血战 `scoreBloodbattleHand`、杭州 `hand.ts`），junk 走的是更老的、按物理张数铺平判定的 `lib/win.ts`。修法：`isWin` 只检查手里剩下的牌（副露本身已经是验证过的完整组合，不需要重新验证），跟血战/杭州的做法看齐；配套加了"暗杠补牌自摸"复现用例（改之前先跑过一次确认真的失败），核对过 10000 局 fuzz 无异常。

## Backlog

- 胡牌结算展示最终赢牌组合（杭州/junk）：仿照血战到底 `BloodbattleWinSnapshot`/`BloodbattlePublicWinSnapshot` 的公开揭示模式，在 `HangzhouGameResult`/`JunkGameResult` 里补上赢家手牌（以及计分实际采用的那一种拆分），赢牌那一刻由 server 广播给所有座位。杭州/junk 目前 `result` 只有 `fanTypes`/`multiplier`/`payout`，没有牌本身；其他家的 `PlayerView` 里对方手牌只有 `handCount`，client 端根本拿不到那些 `TileId`，必须走 server 广播这条路径，不能本地算（自己的手牌虽然本地已知，但具体拆分不唯一，client 重新拆可能拆出和公布番型对不上的另一种合法组合）。
- 可选沉浸体验：音效、音量与静音设置。
- Bot 功能增强：提升 AI 补位/断线托管的出牌质量（杭州财神策略大概率是新的痛点来源）。
- 血战到底专属桌面体验：换三张、定缺、血战状态与完整操作 UI。
- 基于 Zone/LayoutPreset 规划手机横屏/竖屏；mobile 路线与 Expo 实现。
- 日麻立项时复审 `architecture/variant-boundary.md`（会话排名策略行——庄家轮换公式行已由杭州三牢专题验证完毕，见该文档 §4/§5）。
- Junk Table UX 的非紧急缺口：Replay 的牌面渲染、慢网络反馈、声明超时归零时的 `DeadlineCountdown` 行为及相应 e2e。

## 已完成摘要

- Review 配置功能：已完成首个安全会话配置 `totalGames`：创建房间可选 1、4、8 局（默认 4），严格拒绝客户端传入的规则 config；该字段只由 Room 使用，不进入 core、计分或 AI。
- 核心与服务端：junk/bloodbattle RuleSet、CLI/replay/fuzz、多房间、AI 补位/断线托管、归档与持久化已落地。
- Web 与认证：登录、大厅、房间、Junk 可玩牌桌、Replay、主题与 Supabase Google/GitHub OAuth 已完成；房主在等待房间 ready 时客户端会以已 ready 的 AI 自动补满空座位；OAuth 已在本地 Supabase 以真实账号端到端验证。
- Junk Table UX 与 Layout Sketch：桌面 Zone/LayoutPreset、操作 Dock、CSS 布局、事件/跨区域动画、布局编辑与保存读取均已完成并经 e2e/Storybook 验收；bloodbattle 仍只有公共桌面骨架。
- Layout Lab 真实 Preview：`desktop.table-layout.json` 已统一 Zone 几何与展示 Config，Config Panel 可保存草稿；正式桌面与多样例 Preview 复用同一渲染场景，`pnpm verify` 全绿。
- 摸牌显式化：junk/bloodbattle 的摸牌从 core 内联副作用变成显式 `{type:"draw"}` 动作，server 按 `drawRevealDelayMs` 自动代提交，为 UI 留出真实的摸牌停顿窗口；零协议改动，三个 slice（core/server/web）均已验证并合入 main。
- Web 牌桌动画重构：Tile 三层拆分（Slot/Motion/Face）+ 全桌动画调度架构（`diffPlayerView`/`animationLedger`/`useSlotEntering`，含对手弃牌飞行 ghost）已完成并合入本分支，`pnpm --filter @new-mj/web verify` 全绿；耐久结论已分流到 `architecture/frontend-layout.md` §5，专题 brief 已删除。
- 文档体系：已取消独立 decisions 文档；架构取舍归入 architecture/contracts，局部实现理由归代码注释或 package AGENTS。
- 开发流程：slot 化 worktree 现由私有 `@new-mj/devtools` 统一供根创建器、Vite 与 Playwright 使用；创建时自动分配空闲 slot、链接主 worktree 中全部被忽略的根 `.env.*`，并提供 status/doctor。标准 `pnpm dev`、`pnpm test:e2e` 与 `pnpm verify` 自动使用当前 slot，E2E 每 worktree 单 worker。
- 牌局 UI/结算功能：牌局中隐藏 Sign out；Leave room 改为始终确认，二选一"托管"（原有行为）/"强制退出"（新增 `room:end` 消息 + `RoomService.endSession`/`finishSession`，任意在座玩家可立即结束整场对局进入结算，无需他人确认）；局间确认界面新增"结束"按钮复用同一能力；`InfoLabel` 改名 `ScaleText` 并用于 `CenterStatus`；新房间默认每人 1000 积分，结算画面重写为正式 UI（排名/最终积分/冠军标记/局数/Replay 链接）。`session-mechanics.md` 已同步；server/web 均已补测试。
- 杭州麻将 RuleSet：`packages/core/src/rulesets/hangzhou/` 完整实现四签名 + 财神代打胡牌（基本型/七对+豪华判定）、爆头/财飘派生状态、杠链番组、三牢点炮限制与连庄坐庄，`registered-rulesets.ts` 已登记进跨玩法不变量测试；`docs/variants/hangzhou.md` v2 定稿。跨局状态传递用了一个新的通用机制——`Room` 层比较前后两局庄家座位算出 `dealerStreak`，合入下一局 `GameConfig`，不改四签名/`computeNextDealer` 签名，junk/bloodbattle 直接忽略该字段；`architecture/variant-boundary.md`"庄家轮换公式"行据此确认为永久私有（hangzhou 连庄证伪了"顺时针是通用真理"）。单测/fixture/1000 局回归 fuzz 随 `pnpm test` 跑（含 `dealerStreak` 随机化），另跑过一次 10000 局收尾验证均无失败；`apps/server` 补了专门测试；`apps/web` 的 `GamePickerView` 已能创建杭州房间（公共桌面骨架，同血战到底现状；专属 UI 留 Backlog）。
- 杭州麻将专属桌面体验：核心补了 `HangzhouPlayerView.dealerStreak`（公开字段）；web 侧财神高亮（`TileFace` 新 `caishen` variant，web 独立的 `isCaishenTile` 镜像 core 的 `CAISHEN_KIND`）、听牌/爆头/财飘私有徽标（`CenterStatus`）、三牢状态公开提示（同上）、`HangzhouRoundEndOverlay`（专属结算面板，番型中文对照 + 倍数，`TableView` 按 `room.rulesetId` 分流——这是该文件第一处 rulesetId 分支）均已实现，Storybook 故事与 `table.e2e-spec.ts` 杭州用例均已补齐，`pnpm --filter @new-mj/web verify` 全绿并用 Playwright 截图人工确认过财神高亮与三牢提示真实渲染。过程中顺手修了一个真 bug：财神种类原来错标成 `7z`（对应"中"），已更正为 `5z`（对应"白板"），并顺带发现（未修）上面记的 `CenterStatus` 裁切问题。
- 最近一次根目录 `pnpm verify`：2026-07-31 全绿（含 format、typecheck、lint、build、unit、e2e；core junk 1000 局与 bloodbattle 10000 局 fuzz）；本次杭州收尾时 `pnpm verify` 除 §当前风险 记录的既有 e2e 抖动外全绿。
