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
- **D16**（已被真实 Supabase OAuth 取代为主要登录方式，仍保留为非生产兜底）：非生产环境（`NODE_ENV !== "production"`）先同步尝试 dev 假登录 token，成功即放行、失败再落到真实 Supabase 校验，避免 D23 提交进 git 的 demo `.env` 让本地假登录一律被判 unauthorized，也不必等一次可能连不上本地 GoTrue 的网络往返；生产环境完全跳过此分支，不会被泄露的 dev secret 绕过。机制见 `apps/server/src/gateway/auth.middleware.ts`。
- **D17**（技术栈选型已落地稳定，不再逐项展开）：web 定为 Vite + React + React Router + Tailwind v4 + shadcn/ui + Zustand + Vitest + Playwright。
- **D18**：web `game:event` 只增量更新"事实型"事件（回合/出牌/声明窗口），"规则型"事件（吃碰杠成立、胡牌、结算）只记日志、等下一次 `game:snapshot` 整体对齐——避免把 core 的规则解释逻辑在前端复制一份。
- **D19 全明牌（调试/测试专用）是一个泛型纯函数，不新增 `RulesetModule` dispatch 方法**：判定标准（供未来类似需求参考）是**是否有规则语义**——`computeNextDealer` 的公式因玩法而异，必须 dispatch；`getOmniscientView` 只是对 `{ wall, seats }` 结构的泛型读取，玩法之间没有分歧，一个纯函数天然覆盖所有玩法，不需要每个 ruleset 各自实现。访问上是受控技术债：`ALLOW_DEBUG_OMNISCIENT` 环境变量门控 + 复用房间成员校验，不进正式产品 UI。
- **D20 `rebuildPlayerView` 走 `RulesetModule` dispatch，不是 D19 那类泛型函数**：应用 D19 定下的判定标准——事件 payload 的解释逻辑是玩法私有的（junk/bloodbattle 字段完全不同），必须每个 ruleset 各自实现，不能像 `getOmniscientView` 那样绕开契约做成一个通用纯函数。
- **D21**：AI 直连完整 `state`（`nextBotAction` 不经过 `getPlayerView`），不做"PlayerView-only 合法性引擎"公共契约——AI 是自己人代码非玩家可控对手，MVP 阶段这层防作弊契约不是真实需求。技术债：触发条件是日后做 AI 强度分级，或 AI 跑到独立进程/服务不再共享内存态 `state` 时。
- **D22**（已并入 `contracts/session-mechanics.md` §11，原文见 git 历史）
- **D23**：根目录单一 `.env` + `dotenv-flow` 级联加载（`.env` → `.env.[NODE_ENV]` → `.env.local` → `.env.[NODE_ENV].local`），不做 symlink；`.env` 提交进 git 只放 Supabase CLI 固定 demo 值，真实本地值放 `.env.development.local`（gitignored）；`.env.test` 只服务 Playwright，Jest/Vitest 不加载任何 `.env`。
- **D24 shared package 开发态直接消费 `src`（`development` export 条件），生产态不变仍消费 `dist`**：只监听 `dist/*.d.ts` 曾实测在"改实现不改签名"时不触发 `tsc --watch` 重新编译，改成让真实源码进入监听范围更可靠。前提是 `packages/core` 去掉了内部 `@/*` 别名（Node/Vite 不认识 tsconfig `paths`）。

- **D25**：评审点 H 修订为断线 60 秒宽限期。断线期间只标记 `isDisconnected` 并等待，不代打；到期才转 `isAutoPiloted` 并补跑 bot。主动离座仍立即托管。
- **D26**：账号级并发连接由握手层 `SessionRegistry` 去重。同账号第二连接默认以 `SESSION_EXISTS` 拒绝，用户确认后通过 `takeover:true` 踢旧连接并复用断线宽限期恢复房间座位；不引入 REST。
- **D27【2026-07 修订】账号级并发连接升级为三态仲裁**（同 tab / 同浏览器 / 不同浏览器），握手新增 `tabId`/`browserId`、`PROTOCOL_VERSION` bump 到 `"1.1"`。原理见 `architecture/system.md` §6，完整分支逻辑见 `contracts/session-mechanics.md`"账号级并发连接约束"。
- **D28【2026-07】客户端会话恢复改为以 server-truth 为权威，弃用 client 端 `localStorage["new-mj:last-room"]`**：`RoomService` 新增 `userId → roomId` 反查索引（`playerRooms`），`session:identity` 的 ack 附带 `activeRoom: {roomId, phase}`；web 端不再有单独的"恢复"状态机，改用 react-router 的 `loader` + `redirect()` 统一判断"当前状态是否匹配这个路由"，`useRevalidator()` 把被顶号/断线这类没有发生导航的状态变化也接到同一套判断上。理由：Supabase OAuth 是跨设备的，client 记住的 roomId 换设备/清缓存就失效，server 权威不会；服务器重启后房间本身也不在了，两种机制在这种情况下都救不回来，所以没有 client-only 机制能覆盖而 server 权威覆盖不了的场景。完整机制见 `contracts/session-mechanics.md` §12。
- **D29【2026-07】牌桌尺寸计算不用 CSS container query，也不用"顶层单点测量 + JS 全树推导百分比"**（判定标准，供未来类似跨端布局问题参考）：`cqw`/`cqh` 在 Expo/React Native 上没有等价能力，挡未来跨端复用；"顶层测一次、逐层复刻百分比树"要求全树零 margin/padding/border 才准，是隐性脆弱的不变量。
- **D30【2026-07】web 端跨屏适配用离散 `layoutMode`（如 landscape/portrait，各自一套参照画布 + 整体缩放）取代连续 responsive 断点**（判定标准，供未来类似跨端布局问题参考）：判断某类 UI 该用哪种适配方式，看它是不是空间化布局——座位、弃牌区、手牌区的相对位置本身就是语义（谁是对家、弃牌堆在谁面前），不是"内容重排"式的信息流；经典 responsive（流式重排+连续媒体查询断点）针对文字/卡片这类可以自由折叠堆叠隐藏的内容，不适合几何布局硬去套。此举与 D29 同源：都是为了给未来 Expo/React Native 跨端复用留余地，不依赖 CSS 专属机制。完整架构与 Zone/LayoutPreset schema 见 `architecture/frontend-layout.md`。
- **D31【2026-07】牌桌事件动画用 `motion`（`motion/react`）不用纯 CSS**：起步曾用零依赖的 `tw-animate-css`（顺带验证了入场动画的可见阈值——8px/200ms 太保守，肉眼几乎不可见），后改用 `motion`，理由是后续阶段需要"卸载前先播完退场动画"（`AnimatePresence`），纯 CSS 只能靠脆弱的 `setTimeout` 延迟卸载。**坑 1**：`motion.div` 的 `animate` prop 一旦用上就把目标值永久写成内联样式，天然盖过 CSS class/`:hover`——`Tile.tsx` 换成 `motion.div` 后 `hover:scale-*` 与 `dimmed` 的 `opacity-40` 曾静默失效、无测试覆盖，靠事后排查才发现；修法是让这些状态也交给 motion 管（`whileHover`、把 `dimmed` 折进 `animate` 目标），不要跟它抢同一属性的控制权。**坑 2 / 判定标准（供未来类似"共享位置但一方不真的消失"场景参考）**：`layoutId` 共享布局机制上能做跨区域 FLIP（如"认领的牌从牌河飞进副露"），但会让 motion 把"这一帧被另一元素接管"隐式当成 `AnimatePresence` 退场——牌河那张牌会被自动淡出+`pointer-events:none`，与它必须永久保留只是变暗的设计（架构铁律 4）冲突，且不受 `layout="position"` 影响、压不住。结论：`layoutId` 只适合"旧元素真的会离开"的场景；旧元素要永久留着就改用独立临时克隆（`ClaimFlipGhost.tsx`）——只在认领那一刻挂载，测一次源/目标位置，`createPortal` 渲染 `position:fixed` 克隆做纯位置/尺寸 FLIP，播完自己卸载，不接触真实牌河/副露元素。判定该不该播动画的 scaffold（`useIsIncrementalSnapshot`+`usePrefersReducedMotion`→`canAnimateEntries`）目前只在 junk 桌面验证过，未跨玩法验证，暂不进 `architecture/key-designs.md`。
- **D32【2026-07】`TableLayoutConfig`（tile 尺寸/discard 行列/actionDock 比例等 presentation 参数）独立于 `LayoutPreset` 几何，放进 `apps/web/src/layouts/desktop.table-config.ts`（手写 TS 常量），跟 `desktop.table-layout.json` 同目录、同前缀配对，不合并进一个 wrapper document，Lab 暂不编辑**（判定标准，供未来类似"两份强关联配置该不该合并"的场景参考）：否决了把 presentation 数据挂到 `Zone.meta` 上——违反 `frontend-layout.md` §4.2/4.3"`LayoutPreset` 只描述几何"这条为跨 `layoutMode`/未来 Expo 复用而定的规则（同 D29/D30 的可移植性理由）；也否决了"具名 profile 表 + zone 引用 profile 名字"这层间接——目前没有"多个 zone 需要不同 profile"的具体场景，是为假设需求预先建抽象，判定为 YAGNI。独立文件而非合并进同一个 JSON，是因为 Lab 目前完全不消费这份配置（无编辑面板、不接入 Save/Load），没必要绑进 Lab 的 draft/存盘生命周期。字段分组从"领域名"（`hand`/`meldInfo`/`discard`/`actionDock`）改成"zone 种类前缀"（`handZone`/`meldZone`/`discardZone`/`actionDockZone`，同族 zone 如 `hand-bottom/-left/-right/-top` 共享一份），跨 zone 共用字段（`aspectRatio`/`tileGapPx`）单独放 `shared`；原有的运行时 clamp（`normalizeTableLayoutConfig`/`limits`/`readTableLayoutConfig`/`writeTableLayoutConfig`，后两者本就是死代码）随之整体删除——唯一生产者变成手写、经 TS 类型检查的常量，不再有 JSON/localStorage 这类需要防御的未经检查输入。"Lab 里渲染真实牌面组合预览"（此前讨论过又搁置的 "demo show"）明确不在这次范围内。

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
- **BB2 番型 fixture 写作时定下的两条规则口径**（用户不熟悉血战细则，授权按通用实现处理，非项目方逐条确认——日后血战规则打磨若要复核口径，从这条查起）：① 杠上花本质是自摸，`selfDrawBonus='addFan'` 时 `zimo` 与 `gangshanghua` 同时计入，不互斥；② 操作类附加番之间默认可叠加（如杠上炮+海底炮同时成立），只有基础型互斥。
- **J 胡牌快照走 extraTiles 钩子**：`assertContainerUniqueness`/`assertTileConservation`（`packages/core/src/invariants.ts`）新增可选 `extraTiles(state)` 参数，供 RuleSet 把 variantState 内的胡牌快照等容器计入守恒与去重检查；默认空实现，垃圾胡调用点不变。避免在 GameState 顶层为血战新增专用字段，保持 D6 的 variantState 隔离。
