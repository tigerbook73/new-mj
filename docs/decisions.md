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
- **J 胡牌快照走 extraTiles 钩子**：`assertContainerUniqueness`/`assertTileConservation`（`packages/core/src/invariants.ts`）新增可选 `extraTiles(state)` 参数，供 RuleSet 把 variantState 内的胡牌快照等容器计入守恒与去重检查；默认空实现，垃圾胡调用点不变。避免在 GameState 顶层为血战新增专用字段，保持 D6 的 variantState 隔离。
