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

| 阶段 | 内容                                                                                         | 验收                                           | 状态 |
| ---- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---- |
| 0    | 规则与契约定义                                                                               | 四份规格文档定稿                               | ✅   |
| 1    | core 基建 + junk RuleSet + CLI fuzz                                                          | CLI 整局 + 1 万局 fuzz 绿                      | ✅   |
| 1.5  | bloodbattle RuleSet（允许一次接口调整）                                                      | 番型用例全绿 + fuzz                            | ✅   |
| 2    | server：gateway/RoomManager/托管/AI 补位（可与 1.5 并行，基于 junk）                         | 4 模拟客户端整局                               | ✅   |
| 2→3  | 文档结构重构                                                                                 | 新结构落地，详见 `../doc-map.md`               | ✅   |
| 3    | web：登录/大厅/牌桌（先竖切）                                                                | 浏览器真人对局                                 | ✅   |
| 4    | AI 补位：`packages/ai` 最简策略 + `room:addBot` + 自动出牌触发机制                           | 单人开房，其余 3 座补 AI，能完整打完一局垃圾胡 |      |
| 4.5  | 断线托管（复用阶段 4 的自动出牌基础设施）                                                    | 模拟断线，房间继续跑，该座位被自动代打到局终   |      |
| 4.6  | 小特性打包：黑暗模式 + 明牌模式（gateway 级开关，见下）+ 界面/操作优化（纯前端，不涉及后端） |                                                |      |
| 4.7  | Replay / 明牌 Replay（内存事件日志，复用直播已有的可见性过滤逻辑）                           |                                                |      |
| 4.8  | 持久化落地：事件日志搬进 PG（重启后 replay/战绩仍在）/ 战绩查询 / 真正的 Supabase OAuth      |                                                |      |
| 5    | 血战到底打磨到完整可玩，复用阶段 4 沉淀的 AI/UI/持久化框架（垃圾胡基本完成后再开工）         | 单人能对着 AI 完整打完一局血战                 |      |
| 6    | mobile（Expo，血战完成后再考虑）                                                             |                                                |      |

> 阶段 4 系列拆分依据：AI 是唯一"卡住能不能玩"的一块，优先级最高、单独先做；断线托管跟 AI 共享"自动出牌"这同一套基础设施，紧跟着做；小特性大多互相独立可并行；Replay 依赖"先有事件日志"但不需要等 PG，先做内存版；持久化不是新功能，是让已经跑起来的东西"扛得住重启"，放最后。详细方案见 `phase-4-junk-complete.md`。
>
> 阶段 4/5 说明：这条顺序延续阶段 2/3 定下的老规矩——先把 junk 一个玩法从"能跑通"打磨到"能完整玩"，验证一遍 AI/UI/持久化这几层要不要按 ruleset 拆分、怎么拆；血战接入阶段 5 时应该是复用这套框架的增量工作，不是重新设计。若届时血战还要大改阶段 4 定下的框架，说明阶段 4 的设计本身有遗漏，应该回头补文档而不是默认接受重构。

## 已完成阶段

- **阶段 1**（tag `phase-1`）：TypeScript monorepo、纯函数 core、junk RuleSet、CLI 与 fuzz。契约见 `../contracts/engine-contract.md`/`../variants/junk.md`，取舍理由见 `../decisions.md`。
- **阶段 1.5**：血战 RuleSet 完整实现（换三张/定缺、声明窗口、杠分账本、抢杠胡、呼叫转移、流局结算等），同期完成 D12 接口调整。规则见 `../variants/bloodbattle.md`，契约见 `../contracts/engine-contract.md`，取舍理由见 `../decisions.md`。
- **阶段 2**（tag `phase-2`）：NestJS + Socket.IO server 落地（GameService/RoomService/EventBus/RoomsGateway），4 客户端整局验收通过。契约见 `../contracts/protocol-shared.md`/`../contracts/session-mechanics.md`，取舍理由见 `../decisions.md` D13/D14；遗留缺口见下方待办。
- **阶段 2→3**：文档结构重构，详见 `../doc-map.md`。
- **阶段 3**（tag `phase-3`）：web 登录/选玩法/大厅/牌桌竖切跑通——开发态假登录（D16）、Vite+React 技术栈（D17）、房间生命周期靠 ack 初始快照 + 事件广播增量更新驱动（架构铁律 5，不存在"重新查一次房间状态"的消息）、牌桌渲染 `PlayerViewBase` 公共骨架并对"事实型" `game:event` 做增量更新（D18）。junk 验证到能真实发出并成功执行一个 `game:action`；bloodbattle 验证到公共骨架能正确渲染（换三张/定缺属于玩法专属阶段 UI，留给阶段 5）。12 个 e2e 用例（`apps/server` 5 个 + `apps/web` 7 个）已接入根目录 `pnpm verify`（此前 `turbo.json` 一直没有 `test:e2e` 任务，e2e 从未真正进过根级 DoD 链条，这次一并补上）。契约见 `../contracts/*.md`，实现细节见 `apps/web/AGENTS.md`，取舍理由见 `../decisions.md` D16-D18。

## 当前状态

阶段 4（AI 补位）尚未开工，详细方案见 `phase-4-junk-complete.md`（阶段 4 系列收尾后按 `../doc-map.md` §6 吸纳耐久内容并删除）。

**下一步第一个动作**：`packages/ai` 最简策略（`getLegalActions` 随机/简单启发式选一个）+ server 端 `room:addBot` 消息与自动出牌触发机制。

## 待办

- [ ] 阶段 4：协议补 nickname 字段（`room:create`/`room:join` payload 目前没有，`apps/server` 用 userId 派生占位昵称）——界面优化免不了要用真实昵称
- [ ] 阶段 6 前：mobile 具体路线（是否 react-native-web 统一）
- [ ] 真人协作触发时：repo 权限、是否上分支保护
- [ ] 日麻立项时：按 `../architecture/variant-boundary.md` §2 走一次边界复审，重点是庄家轮换公式与会话排名策略两条"待验证"条目
