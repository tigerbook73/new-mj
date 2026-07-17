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
| 4    | 垃圾胡打磨到完整可玩：AI 补位 + 断线托管 + 黑暗模式 + 大厅/房间 UI 重做 + Replay + 牌桌 UI 重做（原 4.1-4.5、4.7，无 4.6，见下方说明）            | 见下方"已完成阶段"小节                         | ✅   |
| 5    | 持久化落地：事件日志/replay/战绩搬进 PG（重启后仍在）+ 真正的 Supabase OAuth（D16 触发条件）——原编号 4.6，从阶段 4 系列拉出单独立项（见下方说明） | 重启 server 后历史对局的 replay/战绩仍可查     | ✅\* |
| 6    | 血战到底打磨到完整可玩，复用阶段 4 沉淀的 AI/UI 框架（应是增量工作，见下方说明）                                                                  | 单人能对着 AI 完整打完一局血战                 |      |
| 7    | mobile（Expo，血战完成后再考虑）                                                                                                                  |                                                |      |

> \* 阶段 5 代码已完成（见下方"已完成阶段"），但 Google/GitHub 按钮点击后的完整 OAuth 跳转需要用户提供真实 OAuth Client secret 才能端到端验证，尚未验证，见下方"下一步"。
>
> 编号没有 4.6：持久化原计划排在阶段 4 系列最后（编号 4.6），因为需要真实 Supabase 项目、跟纯代码推进的子阶段性质不同，用户决定拉出来单独立项为阶段 5（血战、mobile 顺延为 6、7）；4.6 不再使用。
>
> 阶段 6 说明：延续阶段 2/3 定下的规矩——先把 junk 一个玩法打磨完，验证一遍 AI/UI 这几层怎么拆；阶段 6 应该是复用阶段 4 框架的增量工作。若届时血战还要大改阶段 4 定下的框架，说明阶段 4 的设计本身有遗漏，应该回头补文档而不是默认接受重构。

## 已完成阶段

耐久内容已吸纳进 `decisions.md`、`contracts/*.md`、`variants/*.md`，此处只留一句话索引；子阶段拆分推演等过程性内容已删除。

- **阶段 1**（tag `phase-1`）：TypeScript monorepo、纯函数 core、junk RuleSet、CLI 与 fuzz。见 `../contracts/engine-contract.md`/`../variants/junk.md`。
- **阶段 1.5**：血战 RuleSet 完整实现，同期完成 D12 接口调整。见 `../variants/bloodbattle.md`。
- **阶段 2**（tag `phase-2`）：NestJS + Socket.IO server（GameService/RoomService/EventBus/RoomsGateway）。见 `../contracts/protocol-shared.md`/`../contracts/session-mechanics.md`，`decisions.md` D13/D14。
- **阶段 2→3**：文档结构重构。见 `../doc-map.md`。
- **阶段 3**（tag `phase-3`）：web 登录/选玩法/大厅/牌桌竖切跑通。见 `apps/web/AGENTS.md`，`decisions.md` D16-D18。
- **阶段 4**（6 个子步骤：4.1 AI 补位/4.2 断线托管/4.3 黑暗模式/4.4 大厅房间 UI 重做/4.5 Replay/4.7 Junk 牌桌 UI 重做，无 4.6）：`packages/ai` + `room:addBot`/自动出牌；断线托管复用同一自动出牌基础设施（座位标记 `isAutoPiloted`）；主题切换；`lobby:list`/`room:peek`/`room:leave` 等新协议消息；`replay:get`/`debug:replayOmniscientView`（`rebuildPlayerView` 补成 dispatch 方法）；参考 `mj-next` 的真实牌面/布局（只做 junk，bloodbattle 沿用公共骨架）。见 `../contracts/session-mechanics.md` §6/§8/§10，`decisions.md` D19-D21。
- **阶段 5**（持久化 + Supabase OAuth，代码完成）：Prisma 三表无 FK + fire-and-forget 归档 + 鉴权双路径。见 `session-mechanics.md` §11，`decisions.md` D22。OAuth 端到端验证状态见下方"当前状态"。

## 当前状态

阶段 4（6 个子步骤）与阶段 5（持久化 + Supabase OAuth）代码均已完成并按 `../doc-map.md` §6 收尾吸纳，见上方"已完成阶段"的索引。

阶段 5 唯一未闭环的是 OAuth 端到端验证：本沙盒用本地 `supabase start` 验证了 schema/持久化读写/GoTrue 真实 token 校验逻辑，但没能验证经 Kong 代理的完整 `/auth/v1/*` 请求（该沙盒 Kong 层的环境问题，非代码问题），以及 Google/GitHub 按钮点击后的真实 OAuth 跳转（需要用户提供的真实 OAuth Client secret）。

**下一步第一个动作**：等用户提供真实 Supabase 项目 URL/anon key/service role key，以及 Google/GitHub OAuth Client ID/Secret（填进 `.env`，参考 `.env.example`），端到端验证一遍登录→大厅→牌桌的真实 OAuth 流程，确认无误后阶段 5 正式收尾（按 `../doc-map.md` §6）；OAuth secret 到位前，可以先开始阶段 6 血战到底的打磨（两者互不阻塞）。

## 待办

- [ ] 阶段 4：协议补 nickname 字段（`room:create`/`room:join` payload 目前没有，`apps/server` 用 userId 派生占位昵称）——界面优化免不了要用真实昵称
- [ ] 阶段 7 前：mobile 具体路线（是否 react-native-web 统一）
- [ ] 真人协作触发时：repo 权限、是否上分支保护
- [ ] 日麻立项时：按 `../architecture/variant-boundary.md` §2 走一次边界复审，重点是庄家轮换公式与会话排名策略两条"待验证"条目
- [ ] `TableView` 补 `zimo`/`anGang`/`buGang` 的 UI 入口（阶段 3 竖切遗留缺口，4.5 步骤 4 验证 replay 时发现：目前纯点击可能卡在只能自摸/补杠却没按钮的状态，打不完一整局）
