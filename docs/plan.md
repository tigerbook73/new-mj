# plan：阶段路线与状态

> 过程性文档：阶段状态与待办在此维护，收尾清理。需求与架构见 architecture.md / decisions.md。

## 需求（不变基线）

1. Web + 移动端 App
2. 多玩法：垃圾胡（第一，验证架构）→ 血战到底（第二）→ 后续扩展
3. AI 与真人混桌（必须有真人）；4. 多局并行；5. Google/GitHub 登录
4. 架构可扩展即可，允许有边界重构；7. 非商用，不做数据兼容（可清对局表，保用户表，单向引用 userId）

## 阶段路线

| 阶段 | 内容                                                                 | 验收                      | 状态                         |
| ---- | -------------------------------------------------------------------- | ------------------------- | ---------------------------- |
| 0    | 规则与契约定义                                                       | 四份规格文档定稿          | ✅（血战为草案，1.5 前定稿） |
| 1    | core 基建 + junk RuleSet + CLI fuzz                                  | CLI 整局 + 1 万局 fuzz 绿 | ⬅ 当前                       |
| 1.5  | bloodbattle RuleSet（允许一次接口调整）                              | 番型用例全绿 + fuzz       |                              |
| 2    | server：gateway/RoomManager/托管/AI 补位（可与 1.5 并行，基于 junk） | 4 模拟客户端整局          |                              |
| 3    | web：登录/大厅/牌桌（先竖切）                                        | 浏览器真人对局            |                              |
| 4    | 持久化：事件日志落 PG/战绩/重连/回放调试页                           |                           |                              |
| 5    | mobile（Expo）                                                       |                           |                              |

## 当前阶段：阶段 1（规划完成，待实现）

### 目标与边界

- 完成 TypeScript monorepo、纯函数 core、junk RuleSet、CLI 整局和随机 fuzz。
- 阶段验收：CLI 跑通完整一局，随机配置 fuzz 不少于 1 万局并全绿。
- server/web/mobile 只建立可依赖的包边界与占位入口；不提前实现阶段 2 以后功能。
- `rules-bloodbattle.md` 保持草案状态，阶段 1 不实现血战规则。

### 实施步骤

阶段 1 拆成以下五个可独立验证的步骤；每步完成后都应检查 typecheck、lint、test，并与实现一起提交。第 3 步接口评审通过后，才继续填充玩法实现。

1. **Workspace 骨架**：建立 `packages/core`、`packages/protocol`、`packages/ai` 与 `apps/server`、`apps/web`、`apps/mobile`；配置 pnpm/Turbo、strict TypeScript、lint、测试和依赖方向检查。
2. **Core 基础设施**：实现牌集、`TileId`/`TileKind`、seed 驱动且可序列化的 PRNG、牌墙、事件序号、牌集守恒和容器唯一性校验；禁止时间、全局随机和 I/O。
3. **RuleSet 接口评审骨架**：采用**阶段表**作为流程接口，提供类型、RuleSet 接口、空实现和一个预期失败的 happy-path 测试；接口确认后再继续。架构级调整须先更新契约/决策文档。
4. **Junk 完整流程**：实现 `dealing → playing ⇄ awaiting-claims → finished`，包括出牌、吃碰杠、胡牌、过、自动摸牌、杠后尾部补摸、声明裁决、牌河墓碑、结算、事件可见性、`getPlayerView` 和事件重建一致性。
5. **CLI 与阶段验收**：提供 `cli:play` 和支持 seed/action log/config 的 `fuzz`；core 改动期间跑至少 1000 局，阶段验收跑至少 10000 局。fuzz 失败先固化 seed 与 action log 为回归测试。

其中第 4 步必须覆盖标准 4 面子 + 1 对胡牌、点炮/自摸固定结算、流局，以及 `sevenPairs=false`、`robKong=false`、`multiHuPolicy='headJump'` 的 config 解析与随机化。

### 验收与收尾

- 全绿运行：`pnpm typecheck`、`pnpm lint`、`pnpm test`、CLI 完整对局和至少 10000 局 fuzz。
- 覆盖非法动作状态不变、守恒/唯一性、声明裁决、胡牌/结算、事件可见性、TileId 泄漏和视图重建一致性。
- 阶段收尾执行 doc-map 吸纳、契约/代码漂移审计，更新本节为完成状态并写入阶段 2 第一个具体动作。
- 实现与测试同 commit；阶段验收后创建 `phase-1` tag。

### 开放问题

- [x] RuleSet 流程接口采用阶段表。

### 进度

- [x] 阶段 1 实施计划已确定。
- 下一步第一个动作：执行阶段 1 Step 1，建立 workspace 骨架并提交类型检查、lint、测试和依赖方向的最小可运行配置。

## 待办

- [ ] 阶段 1.5 前：rules-bloodbattle.md 批注定稿（重点：番型互斥、明杠付分、退税细则版本）
- [ ] 阶段 2 前：房间与对局关系模型（一局即散 or 连续 N 局、底分倍率）→ 产出并入 protocol.md 或 docs/rooms.md
- [ ] 阶段 2 前：AI 定位确认（建议：简单启发式补位）
- [ ] 阶段 5 前：mobile 具体路线（是否 react-native-web 统一）
- [ ] 真人协作触发时：repo 权限、是否上分支保护
