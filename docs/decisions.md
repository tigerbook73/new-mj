# 决策记录（个人项目·轻量索引）

> 记录不容易从代码/架构文档反推的"为什么"。结论已经固化进 `AGENTS.md`/`architecture/*.md`/`contracts/*.md` 的条目只留指针，不重复内容；已落地且对未来无指导价值的一次性选型/实现细节压成 1-2 句存根。不严格 append-only——内容可随时精简，但编号默认保留，避免误导"决策不存在过"。完整历史推理见 git 历史。

## 架构决策

- **D1**：不用 Colyseus，用 NestJS + Socket.IO——麻将是低频离散事件，用不上 Colyseus 面向高频状态同步的强项。
- **D2**：UI 第一版 DOM + Motion，回合制牌桌不需要游戏引擎渲染。
- **D3**（已并入 `architecture/system.md` §2，原文见 git 历史）
- **D4**：纯函数状态机 + 事件溯源（Room 用有状态对象包裹纯核）——可复现、可测试、序列化/历史免费；纯度只要求在引擎边界。
- **D5**（已并入 `AGENTS.md` 架构铁律 1/3 与 `architecture/system.md` §5，原文见 git 历史）
- **D6**（已被 D12 取代，旧模型对现存代码不再有解释力）
- **D7**：非商用，不做兼容性——对局数据可清（保用户表），事件日志格式可自由变更，协议不做版本演进（仅 `PROTOCOL_VERSION` 常量提示刷新）。
- **D8 配置边界**：变体之间用 RuleSet（代码），变体之内地方细则用 config（数据）；结构级差异不做成配置。测试以标准配置为黄金路径，fuzz 随机 config 扫组合。
- **D9**：垃圾胡验证 core 分层，血战的实现落差矫正了 RuleSet 抽象，促成 D12 的接口调整。
- **D10**（已并入 `architecture/system.md` §2 与 `AGENTS.md` 架构铁律 3，原文见 git 历史）
- **D11**（已并入 `contracts/session-mechanics.md` §1/§3，原文见 git 历史）
- **D12**（已并入 `architecture/key-designs.md` §5 与 `architecture/data-model.md` §4，原文见 git 历史）
- **D13**：`apps/server` 是 monorepo 里唯一的 CommonJS 包，跟随 NestJS 官方 CJS-first 立场；`packages/core`/`packages/protocol` 用 tsup 双发 CJS+ESM 兼容。持续生效的约束，新增 package 时仍需判断走哪边。
- **D14**：server 房间编排（`RoomService`）与 Socket.IO 传输层解耦——`RoomService` 只发域事件，座位↔socket 映射由 `RoomsGateway` 的 `ConnectionRegistry` 维护；鉴权放握手中间件而非 Nest 守卫（守卫护不住握手阶段）。
- **D15**（已并入 `contracts/session-mechanics.md` §5 与 `contracts/engine-contract.md` §4，原文见 git 历史）
- **D16**（已被阶段 5 真实 Supabase OAuth 取代）：dev 假登录降级为无 `SUPABASE_URL` 时的开发态 fallback，机制见 `apps/server/src/gateway/auth.middleware.ts`。阶段 5.1 补充：配置了 Supabase 但 `auth.getUser` 校验失败时，仅在非生产环境（`ConfigService.isProduction` 为 false，即 `NODE_ENV !== "production"`）会重试这条 D16 校验作为兜底——根因是 D23 提交进 git 的 `.env` 带着 Supabase CLI demo 配置，导致本地 `pnpm dev` 的假昵称登录一律被判 unauthorized；生产环境必须设 `NODE_ENV=production`，该分支不触发，避免泄露的 dev secret 绕过真实鉴权。
- **D17**（技术栈选型已落地稳定，不再逐项展开）：web 定为 Vite + React + React Router + Tailwind v4 + shadcn/ui + Zustand + Vitest + Playwright。
- **D18**：web `game:event` 只增量更新"事实型"事件（回合/出牌/声明窗口），"规则型"事件（吃碰杠成立、胡牌、结算）只记日志、等下一次 `game:snapshot` 整体对齐——避免把 core 的规则解释逻辑在前端复制一份。
- **D19 全明牌（调试/测试专用）是一个泛型纯函数，不新增 `RulesetModule` dispatch 方法**：判定标准（供未来类似需求参考）是**是否有规则语义**——`computeNextDealer` 的公式因玩法而异，必须 dispatch；`getOmniscientView` 只是对 `{ wall, seats }` 结构的泛型读取，玩法之间没有分歧，一个纯函数天然覆盖所有玩法，不需要每个 ruleset 各自实现。访问上是受控技术债：`ALLOW_DEBUG_OMNISCIENT` 环境变量门控 + 复用房间成员校验，不进正式产品 UI。
- **D20 `rebuildPlayerView` 走 `RulesetModule` dispatch，不是 D19 那类泛型函数**：应用 D19 定下的判定标准——事件 payload 的解释逻辑是玩法私有的（junk/bloodbattle 字段完全不同），必须每个 ruleset 各自实现，不能像 `getOmniscientView` 那样绕开契约做成一个通用纯函数。
- **D21**：阶段 4.1 AI 直连完整 `state`（`nextBotAction` 不经过 `getPlayerView`），不做"PlayerView-only 合法性引擎"公共契约——AI 是自己人代码非玩家可控对手，MVP 阶段这层防作弊契约不是真实需求。技术债：触发条件是日后做 AI 强度分级，或 AI 跑到独立进程/服务不再共享内存态 `state` 时。
- **D22**（已并入 `contracts/session-mechanics.md` §11，原文见 git 历史）
- **D23**：根目录单一 `.env` + `dotenv-flow` 级联加载（`.env` → `.env.[NODE_ENV]` → `.env.local` → `.env.[NODE_ENV].local`），不做 symlink；`.env` 提交进 git 只放 Supabase CLI 固定 demo 值，真实本地值放 `.env.development.local`（gitignored）；`.env.test` 只服务 Playwright，Jest/Vitest 不加载任何 `.env`。
- **D24 shared package 开发态直接消费 `src`（`development` export 条件），生产态不变仍消费 `dist`**：只监听 `dist/*.d.ts` 曾实测在"改实现不改签名"时不触发 `tsc --watch` 重新编译，改成让真实源码进入监听范围更可靠。前提是 `packages/core` 去掉了内部 `@/*` 别名（Node/Vite 不认识 tsconfig `paths`）。

- **D25**：评审点 H 修订为断线 60 秒宽限期。断线期间只标记 `isDisconnected` 并等待，不代打；到期才转 `isAutoPiloted` 并补跑 bot。主动离座仍立即托管。
- **D26**：账号级并发连接由握手层 `SessionRegistry` 去重。同账号第二连接默认以 `SESSION_EXISTS` 拒绝，用户确认后通过 `takeover:true` 踢旧连接并复用断线宽限期恢复房间座位；不引入 REST。
- **D27【2026-07 修订】账号级并发连接升级为三态仲裁**（同 tab / 同浏览器 / 不同浏览器），握手新增 `tabId`/`browserId`、`PROTOCOL_VERSION` bump 到 `"1.1"`。原理见 `architecture/system.md` §6，完整分支逻辑见 `contracts/session-mechanics.md`"账号级并发连接约束"。

## 规格级决策（评审点，详情见规格文档定稿）

- **A 牌用实例 ID（TileId）**：React/Motion 需要稳定 key；守恒不变量精确化。代价：可见性过滤须视 id 与牌面同级敏感。
- **B 仅有合法响应者进声明窗口**：不采用商用的"全员强制表态"混淆方案（D7 口径接受时序泄漏）。
- **C 摸牌为引擎自动转移**：seed 固定牌墙使其确定；省一类客户端往返；杠补摸同理。
- **D 非法动作不进事件日志**：仅 applyAction 错误返回 + ack 拒绝 + server 错误日志。
- **E/F**（已并入 `variants/junk.md`，原文见 git 历史）
- **G 事件重建 ≡ 直接派生**：核心测试不变量，快照与事件流一致性的根基。
- **H**（已并入 `contracts/session-mechanics.md` §8，原文见 git 历史）
- **I**（已并入 `contracts/session-mechanics.md` §8，原文见 git 历史）
- **牌河墓碑模型（DiscardEntry.claimedBy）**：保留被声明牌的原位与完整弃牌历史；UI 渲染自由 + 日麻振听将来直接可用；守恒只计活跃条目。
- **BB1**（已并入 `variants/bloodbattle.md`，原文见 git 历史）
- **BB2 番型 fixture 写作时定下的两条规则口径**（用户不熟悉血战细则，授权按通用实现处理，非项目方逐条确认——阶段 6 血战打磨时若要复核规则口径，从这条查起）：① 杠上花本质是自摸，`selfDrawBonus='addFan'` 时 `zimo` 与 `gangshanghua` 同时计入，不互斥；② 操作类附加番之间默认可叠加（如杠上炮+海底炮同时成立），只有基础型互斥。
- **J 胡牌快照走 extraTiles 钩子**：`assertContainerUniqueness`/`assertTileConservation`（`packages/core/src/invariants.ts`）新增可选 `extraTiles(state)` 参数，供 RuleSet 把 variantState 内的胡牌快照等容器计入守恒与去重检查；默认空实现，垃圾胡调用点不变。避免在 GameState 顶层为血战新增专用字段，保持 D6 的 variantState 隔离。
