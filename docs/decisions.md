# 决策记录（append-only：只增不改）

## 架构决策

- **D1 不用 Colyseus，用 NestJS + Socket.IO**：Colyseus 的可变 Schema 状态同步与纯函数引擎/事件溯源冲突；其强项是高频状态同步，麻将是低频离散事件。
- **D2 UI 第一版 DOM + Motion**：回合制牌桌无需游戏引擎渲染；渲染层只消费 PlayerView 与事件流，将来可叠加 Lottie/Pixi/3D 而不动业务。
- **D3 Render(付费档) + Supabase**：WebSocket 长连接需长驻进程（排除 Vercel serverless）；回合制对延迟不敏感（不需要 Fly.io 多区域）；Supabase 开箱 OAuth+PG。
- **D4 纯函数状态机 + 事件溯源；Room 有状态对象包裹纯核**：可复现（seed+actions）、可测试（无 I/O）、序列化免费、历史免费；纯度只要求在引擎边界。
- **D5 优先级进 core，时间留 server，事件带可见性**：规则逻辑 vs 时间/I/O 的分界；超时与主动 pass 同型；server 分发无需理解规则。
- **D6 core = 基建层 + RuleSet 插件层**：加玩法 = 新增实现而非改核心；牌集配置化、variantState 命名空间、rulesetId 三个零成本结构决定先行。
- **D7 非商用，不做兼容性**：可清对局数据（保用户表），事件日志格式可自由变更；协议不做版本演进（仅 PROTOCOL_VERSION 常量提示刷新）。
- **D8 配置边界**：变体之间 RuleSet（代码），变体之内地方细则 config（数据）；结构级差异不做成配置。测试以标准配置为黄金路径，fuzz 随机 config 扫组合。
- **D9 垃圾胡为第一玩法**：最简规则快速验证 core 分层；血战为第二个实现，用两个真实实现的拉扯矫正 RuleSet 抽象（预期阶段 1.5 一次有边界的接口调整）。
- **D10 除 OAuth 外全走 Socket.IO**：砍掉 tRPC/HTTP 整层（查询用 ack 模式）；握手单次 JWT 鉴权绑定 socket.data.userId，不做二次临时 token（同信道同凭据的第二道门不增加攻击成本）；服务端仅 /health。
- **D11 房间对应连续 N 局，非一局即散**：房间生命周期跨多局运行，比分逐局累加，不是打完一局就散场重开。N 的具体取值、底分倍率、庄家轮换等实现细节留待阶段 2 设计，产出并入 `protocol.md` 或 `docs/rooms.md`。
- **D12 core 结构反转：engine-api 极小外壳 + rulesets/\* 各自完整状态机 + lib 无观点积木（方案 C）**：日麻确定要做，其差异（王牌区/宝牌改变牌墙结构、四风连打等中途流局出口、"无役不能和"击穿胡牌判定∥计分分离、立直后行为模式切换）是控制流级差异，不是数据/枚举级差异，方案 A/B（共用回合循环模块）无法容纳。旧模型"通用框架 + RuleSet 插件"（D6）把变化点上移到框架层——`ruleset.ts` 8 方法接口里 `getClaimOptions`/`resolveClaims`/`evaluateWin`/`settle`/`parseConfig` 五个在全仓库范围内零消费者，接口注释已自称"junk 一次性实现的形状，血战落地会强制调整"。新模型：engine-api（`createGame`/`applyAction`/`getLegalActions`/`getPlayerView` 四签名 + 事件信封 + PlayerView 骨架，四方共同依赖）不反向了解任何玩法；每个玩法在 `rulesets/<id>/` 下实现完整状态机（自有 Action/Phase/State，互不 import 对方流程代码）；`lib/` 收纯函数积木（牌/墙/PRNG/手牌分解/容器不变量）。`variantState` 字段撤销——规则状态本身就是完整状态。实施：目录/归属搬移 + import 调整为主，逻辑本体不动（阶段 1 早期窗口，血战尚未真正接入 `applyAction` 边界，避免阶段 1.5 与日麻两次流程重构）。
- **D13 apps/server 是 monorepo 里唯一的 CommonJS 包**：其余 packages/apps 均为 ESM。NestJS 框架官方立场是 CJS-first、不打算迁移 ESM（[nestjs/nest#13319](https://github.com/nestjs/nest/issues/13319)，作者原话 "CJS was the standard way of doing modules for +10 years and it's not going anywhere"），跟随官方默认构建方式（`nest build`/`nest start`）比自建 ESM 编译方案摩擦更小；`packages/core`/`packages/protocol` 均用 tsup 双发 CJS+ESM（`exports.require`/`exports.import`），让 CJS 的 server 能直接 `require()` 它们，不必让 apps/server 迁就 ESM。
- **D14 server 房间编排与 Socket.IO 传输层解耦**：`RoomService` 只往类型化 `EventBus` 发域事件（`room:playerJoined`/`game:snapshot` 等），不知道 socket/座位的映射关系；座位↔socket 映射由 `RoomsGateway` 自己的 `ConnectionRegistry` 维护，房间内广播直接用 Socket.IO 原生房间功能（`client.join(roomId)`），只有 `game:snapshot`/`game:event` 这两个需要按座位单播的消息才查这张表。换传输层（如未来接 Redis pub/sub 支持多进程）时 `RoomService` 不用动。鉴权同理放在 Socket.IO 握手中间件（`server.use()`）而不是 Nest 的 `CanActivate` 守卫——守卫只保护单条消息、握手阶段不经过它，未鉴权连接会白占资源；中间件能在连接建立前拒绝。
- **D15 庄家轮换公式搬入 core，`createGame` 的庄家改为外部显式必填参数**：D11 把"庄家轮换等实现细节"明确留待阶段 2 设计（未定归属）；落地后发现两处问题需一并修：① `RoomService.computeNextDealer` 与 core 内部 `createJunkGame`/`createBloodbattlePrelude` 各自用 PRNG 独立算出一个"庄家"，两者互不相通——server 广播的 `room:dealerChanged` 对实际发牌毫无影响，且这次 PRNG 抽取还顺带污染了牌墙洗牌用的同一条 PRNG 流；② 庄家判定本质是"给定上一局结果，下一局谁坐庄"，属于可能因玩法而异的规则（架构铁律 6：用户举例无连庄/连庄可抢庄/连庄下庄轮庄/连庄叠倍有上限），不应留在 server 里按 `rulesetId` 分支。修法：`createGame` 新增必填 `dealer: SeatId` 参数（第 1 局由 server 决定=房主座位，此后每局由 core 决定），`RulesetModule` 新增第五个 dispatch 方法 `computeNextDealer(finishedState, currentDealer) → SeatId`，入参直接复用已存在的、刚结束一局的不透明 `TState`，不引入新的 `SessionState` 类型或 `Room` 字段——今天两个玩法的公式都是"不看结果，顺时针轮转"（`docs/rules-junk.md` "不记连庄"、`docs/rules-bloodbattle.md` 定稿未提连庄），没有真实消费者需要跨局记忆，按 D12 的教训不预先建投机基建；未来若要支持连庄/抢庄/叠倍，届时这个函数签名是自然的扩展点。牌墙洗牌 PRNG 不再被抽庄家污染：`createWall(createPrng(seed), ...)` 直接用种子起步，既有 seed 对应的实际牌墙顺序随之改变（预期内，无 fixture 依赖具体牌序）。

## 规格级决策（评审点，详情见规格文档定稿）

- **A 牌用实例 ID（TileId）**：React/Motion 需要稳定 key；守恒不变量精确化。代价：可见性过滤须视 id 与牌面同级敏感。
- **B 仅有合法响应者进声明窗口**：不采用商用的"全员强制表态"混淆方案（D7 口径接受时序泄漏）。
- **C 摸牌为引擎自动转移**：seed 固定牌墙使其确定；省一类客户端往返；杠补摸同理。
- **D 非法动作不进事件日志**：仅 applyAction 错误返回 + ack 拒绝 + server 错误日志。
- **E/F 窗口选项按座位私发；ClaimResponded 保留**：回放调试的输入完整性 + 窗口中途重连恢复（PlayerView.myClaimResponse）。
- **G 事件重建 ≡ 直接派生**：核心测试不变量，快照与事件流一致性的根基。
- **H 对局中退出 = 转托管代打到局终**：掉线与主动离座同路径，不允许中途散局。
- **I 重连快照优先**：整体替换最简且绝对一致；lastSeq 增量为将来优化。
- **牌河墓碑模型（DiscardEntry.claimedBy）**：保留被声明牌的原位与完整弃牌历史；UI 渲染自由 + 日麻振听将来直接可用；守恒只计活跃条目。
- **ack/事件关系**：查询=ack 给数据；命令=ack 给回执、事件给状态（广播含本人，幂等）；进新上下文=ack 给快照。
- **BB1 血战标准配置**：阶段 1.5 采用大众线上川麻「血战到底 + 换三张」作为黄金路径：私下换三张/定缺、定缺优先出牌、一炮多响、三家胡或流局结束、4 番封顶、自摸加番、直杠 2/补杠各 1/暗杠各 2、呼叫转移、花猪→退税→查大叫。地方差异保留在 `BloodbattleConfig`，不在 server/client 复制规则。
- **BB2 番型 fixture 写作时定下的三条规则口径**（用户不熟悉血战细则，授权按通用实现处理，非项目方逐条确认）：① 杠上花本质是自摸，`selfDrawBonus='addFan'` 时 `zimo` 与 `gangshanghua` 同时计入，不互斥；② 操作类附加番之间默认可叠加（如杠上炮+海底炮同时成立），只有基础型互斥；③ `rules-bloodbattle.md` 原 `bb-002` 例子的暗杠裸放在 `hand` 里导致牌数少 1 张、凑不出合法分解，已改为记入 `melds`（`type: anGang`）并配平手牌，分数结果不变。
- **J 胡牌快照走 extraTiles 钩子**：`assertContainerUniqueness`/`assertTileConservation`（`packages/core/src/invariants.ts`）新增可选 `extraTiles(state)` 参数，供 RuleSet 把 variantState 内的胡牌快照等容器计入守恒与去重检查；默认空实现，垃圾胡调用点不变。避免在 GameState 顶层为血战新增专用字段，保持 D6 的 variantState 隔离。
