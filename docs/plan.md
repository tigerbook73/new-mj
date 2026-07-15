# plan：阶段路线与状态

> 过程性文档：阶段状态与待办在此维护，收尾清理。需求与架构见 architecture.md / decisions.md。

## 需求（不变基线）

1. Web + 移动端 App
2. 多玩法：垃圾胡（第一，验证架构）→ 血战到底（第二）→ 后续扩展
3. AI 与真人混桌（必须有真人）；4. 多局并行；5. Google/GitHub 登录
4. 架构可扩展即可，允许有边界重构；7. 非商用，不做数据兼容（可清对局表，保用户表，单向引用 userId）

## 阶段路线

| 阶段 | 内容                                                                 | 验收                      | 状态 |
| ---- | -------------------------------------------------------------------- | ------------------------- | ---- |
| 0    | 规则与契约定义                                                       | 四份规格文档定稿          | ✅   |
| 1    | core 基建 + junk RuleSet + CLI fuzz                                  | CLI 整局 + 1 万局 fuzz 绿 | ✅   |
| 1.5  | bloodbattle RuleSet（允许一次接口调整）                              | 番型用例全绿 + fuzz       | ✅   |
| 2    | server：gateway/RoomManager/托管/AI 补位（可与 1.5 并行，基于 junk） | 4 模拟客户端整局          | ✅   |
| 3    | web：登录/大厅/牌桌（先竖切）                                        | 浏览器真人对局            |      |
| 4    | 持久化：事件日志落 PG/战绩/重连/回放调试页                           |                           |      |
| 5    | mobile（Expo）                                                       |                           |      |

> 阶段 2/3 说明：protocol、PlayerView、UI 架构按 `core-types-and-events.md`/`protocol.md` 中已覆盖两套规则的契约实现，但先只接入 junk 的具体规则跑通产品；血战规则接入时应是增量（新增阶段/组件），不重新设计协议或 UI 架构——若届时仍需动老代码，说明契约本身有遗漏，应回头补文档而非默认接受重构。

## 阶段 1：已完成（tag `phase-1`）

TypeScript monorepo、纯函数 core、junk RuleSet、CLI 与 fuzz 全部完成并测试通过；实施步骤见 git 历史（`8bd6aa3`…`587693d`）。契约留存于 `core-types-and-events.md`/`rules-junk.md`，取舍理由见 `decisions.md`。

**下一步第一个动作**：为 `bloodbattle` 建立失败的番型/换三张/定缺 fixture，并据此评审 RuleSet 接口调整。

## 阶段 1.5：已完成

血战 RuleSet 已完成换三张/定缺、playing 回合、缺门约束、碰/杠/胡声明窗口、头跳/一炮多响、多赢家离场、杠分账本、抢杠胡、呼叫转移、三家胡、牌墙耗尽、查花猪/退税/查大叫和 `mustHuOnLastFour`。已注册进 `engine.ts`，PlayerView 与事件回放保持一致；public 事件含已公开牌的 TileId（支持 UI 精准动画），隐藏牌仅 private 事件包含。

验收结果：番型 fixture 20 条，core 测试 57 条通过；junk 1000 局 fuzz 通过；bloodbattle 多配置 10000 局 fuzz 通过；根目录 `pnpm verify`（format:check、typecheck、lint、test）全绿。

本阶段同时完成 D12 接口调整、core package alias、常量整理、测试目录分层、局部 AI 指导文档和 `PlayerViewBase` 类型边界收窄。具体规则与取舍已回写 `docs/rules-bloodbattle.md`、`docs/core-types-and-events.md`、`docs/decisions.md`。

**下一步第一个动作**：开始阶段 2 房间与对局关系模型设计。

## 阶段 2：已完成（tag `phase-2`）

NestJS + Socket.IO server 全部落地：`packages/protocol` 从占位补成 zod schema + tsup 双发 CJS/ESM；`apps/server` 走 CommonJS（D13）——`GameService`（薄封装 core 四签名）、`RoomService`（房间生命周期编排，游戏结束判定读 `GameEnded` 事件而非 `state.phase`）、类型化 `EventBus` 与传输层解耦（D14）、`RoomsGateway`（握手中间件鉴权 + `ConnectionRegistry` 座位单播 + `eventsVisibleTo()` 可见性过滤）。

验收结果：4 个真实 `socket.io-client` 连接跑通完整 4-round 会话（`create → join → ready → start → 4局 → sessionFinished`，用 `playJunkGame` 生成确定性动作序列而非 mock）；单元 + e2e 全绿；根目录 `pnpm verify`（format:check、typecheck、lint、build、test）全绿。契约变更（`GAME_NOT_STARTED` 错误码、`room:start` ack 改纯回执）已回写 `docs/protocol.md`/`docs/rooms.md`；实施过程中的取舍见 `docs/decisions.md` D13/D14。`docs/phase-2-server.md` 已按 doc-map 惯例删除，结论分流至 `decisions.md`/`architecture.md`/`rooms.md`/`protocol.md`/`apps/server/AGENTS.md`。

**已知缺口**（非阻塞，留给后续阶段）：`room:create`/`room:join` 协议 payload 没有 nickname 字段，当前用 userId 派生占位昵称；AI 补位、断线托管未实现（明确排除在 MVP 外）。

**下一步第一个动作**：启动阶段 3 web 竖切设计——先定登录（Supabase SDK 直连）+ 大厅 + 牌桌的最小页面流转，复用 `packages/protocol` 的类型对接 `apps/server` 已跑通的 Socket.IO 协议。

## 待办

- [x] 阶段 1.5 前：rules-bloodbattle.md 定稿（番型互斥、杠分、呼叫转移、退税与终局结算顺序已确认）
- [x] 阶段 2 前：房间与对局关系模型——已决定连续 N 局（非一局即散，见 decisions.md D11）；N=4、庄家轮换等细节已产出至 `docs/rooms.md` 并实现
- [ ] 阶段 3 前：协议补 nickname 字段（`room:create`/`room:join` payload 目前没有，`apps/server` 用 userId 派生占位昵称）
- [ ] 阶段 2/3：AI 定位确认（建议：简单启发式补位），MVP 阶段 2 明确未实现
- [ ] 阶段 5 前：mobile 具体路线（是否 react-native-web 统一）
- [ ] 真人协作触发时：repo 权限、是否上分支保护
