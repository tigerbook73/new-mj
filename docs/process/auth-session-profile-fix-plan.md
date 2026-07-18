# Auth session 与 OAuth profile 修复计划

> 实施状态（2026-07-18）：协议、server 房间宽限期/SessionRegistry、web auth bootstrap/sign out/profile/avatar/dev 伪账号骨架已落地；下一步是补齐专项集成测试并做真实 Supabase OAuth 手工验收。

## Summary

目标分支：`fix/auth-session-and-profile`

修复以下问题：

1. sign out 没有真正生效；
2. 刷新后登录状态丢失；
3. Google/GitHub 用户名显示为 UUID/HEX；
4. 获取并显示 Google/GitHub avatar；
5. 刷新时尝试恢复当前房间或牌桌；
6. 断线（含刷新）不应立即把座位判给 bot——给 60 秒重连宽限期；主动 sign out 则维持"立即托管"的现状行为。
7. 测试用的 nickname 登录改成有状态的"伪账号"：同名 = 同账号、免密码、刷新后自动保持登录，直到显式 logout。
8. 同一账号并发重复登录（多标签页/多设备）目前完全没人管——检测到冲突时问用户是否要接管，确认则踢掉旧连接、新连接继承旧连接的房间/座位状态；不确认则新连接自己放弃登录。

**本次修订相对上一版的关键变化**：v1 计划里"in-game 状态刷新后重新绑定座位 socket"与已实现且已在 `docs/contracts/session-mechanics.md` §6/§8 定稿的评审点 H（断线 = 立即且永久转 `isAutoPiloted`，MVP 明确不做重连恢复真人操控）直接冲突。经用户确认，本次**正式修改评审点 H**：断线不再立即永久托管，改为"断线广播 + 60 秒重连宽限期（期间纯等待、不由 bot 代打，跟一个在线但没操作的人没区别）+ 宽限期内可凭同一 userId 抢回座位 + 到期才转永久托管并补跑 bot"；宽限期等待与到期后的永久托管是两种状态，需要在协议里区分开，UI 也需要能区分展示。这是一次协议语义变更，必须先改 `session-mechanics.md`（连带 `decisions.md` 补一条决策记录）再改代码，且与改动同一个 commit。

这一版又做了两处修正：① 重连数据改由 `room:enter` 的 ack 直接携带，不再另外推送 `game:snapshot` 事件——原方案会跟 `TableView` 监听器挂载时机撞出竞态（详见下方"架构变更"一节）；② 新增"账号级重复登录检测"整节（用户点 8），复用现有 Socket.IO 握手拒绝模式（`connect_error` 带错误码），不引入 REST。

## 架构变更：断线宽限期（评审点 H 修订）

### 现状（v1 冲突点）

- `RoomsGateway.handleDisconnect` 在 socket 断开的**同一时刻同步**调用 `RoomService.handleDisconnect → markAutoPiloted`，把该座位标记 `isAutoPiloted = true` 并立刻跑 `autoPlayBots`；这个标记永不清除。
- 浏览器刷新就是一次真实的 socket 断开——如果不改这条，"刷新恢复 in-game 座位"这件事在断开的瞬间座位就已经被永久判给 bot，重新绑定 socket 也要不回操控权。

### 新设计

- **两种"托管"要分清，且用户已明确：宽限期内不代打，纯等待**：
  - _宽限期等待_（新增）：socket 掉线但**可能是刷新/网络抖动**，给 60 秒窗口。期间**不**设置 `isAutoPiloted`、**不**跑 `autoPlayBots`——这个座位就是"暂时没有 socket 绑定"，跟一个人在线但迟迟不操作没有区别：其他座位可以正常行动，只有轮到这个座位时对局才会卡住等待，直到重连或宽限期到期。之所以能这样做：`docs/contracts/protocol-shared.md` §2 已经写明"超时代提交 pass"这条（架构铁律 1 描述的设计）**尚未实现**，现状本来就没有任何逐动作超时机制，所以宽限期内"什么都不做、纯等待"跟现有行为是一致的，不需要额外引入伪造的超时兜底。
  - _永久托管_：宽限期到期没等到同一 userId 重连，或者玩家主动 `room:leave`/sign out——这两种情况维持现状实现（`markAutoPiloted` 之后立即判断 `hasNoHumanLeft`，是就关房，并对当前卡住的回合跑一次 `autoPlayBots` 把悬而未决的动作接过来），不等待、不可逆。
  - 这两种状态因此互斥（不会同时 `isDisconnected && isAutoPiloted`），比 v1 设计更简单：`isAutoPiloted` 只在"永久"态为 true，宽限期内只置 `isDisconnected`。
- **`Room` 内部状态**新增一个字段标记宽限期（具体命名实现时定，建议 `player.disconnectedAt?: number`——非空即"宽限期内"；到期或主动离开时清掉这个字段，改为 `isAutoPiloted = true`）。
- **定时器**：`RoomService` 内维护 `Map<"roomId:userId", NodeJS.Timeout>`。断线时启动 60 秒定时器，**不触碰 `isAutoPiloted`/不调用 `autoPlayBots`**；定时器触发时才执行"永久托管"那一套（`markAutoPiloted` 收尾逻辑：置 `isAutoPiloted = true` + `hasNoHumanLeft` 判断 + 必要时 `closeAbandonedRoom` + 跑一次 `autoPlayBots` 补上悬而未决的回合）。计时属于 server 独有职责，符合根 `AGENTS.md` 架构铁律 1（时间只在 server）。
- **已知后续交互**（不在本次范围内，先记一笔）：如果以后真的实现了"超时代提交 pass"（`deadline` 那条协议字段），需要重新决定它跟断线宽限期的关系——比如断线期间要不要暂停/延长这个 deadline，避免一个正常在线但手速慢的人和一个已经断线的人被同一套超时逻辑误伤。
- **主动 sign out 走另一条路径，不经过宽限期**：web 端 `signOut()` 如果当前在房间里，先对当前 socket 发 `room:leave`（已实现，`in-game` 分支就是"立即标记 `isAutoPiloted` + 检查是否房间里已无真人 + 无真人则关房"，跟点 2 的诉求完全一致），等这个 ack 回来（或超时兜底），再走 `supabase.auth.signOut()` → 断开 socket → 清理本地状态 → 跳 `/login`。**这条不需要新的 server 逻辑**，只是 web 端把"先礼貌离座再断线"补上——之所以现在会表现成"没有主动 signout 不直接退出游戏"，是因为以前 signOut 直接 `socket.disconnect()`，触发的是断线路径而不是 `room:leave`。
- **重连入口**：扩展现有 `room:enter`（不新增消息类型，维持"进新上下文 = ack 给快照"的既有形状不变）。处理时按 `socket.data.userId`（握手身份，不信任 payload）在目标房间的 `players` 里找是否有座位 `userId` 匹配、且 `phase === "in-game"`、且该座位处于"宽限期内"：
  - 命中：清定时器、清 `disconnectedAt`、`isAutoPiloted = false`、`ConnectionRegistry.track()` 重新绑定座位 socket、广播 `room:playerReconnected { seat }`、**在这次 `room:enter` 的 ack 响应里直接带上这个座位的 `{ view, seq }`**（不是另外 emit 一条 `game:snapshot` 事件）。
    - **为什么不能用推送事件**：`apps/web/src/views/TableView.tsx` 的 `game:snapshot`/`game:event` 监听器是在 `TableView` 挂载时才 `useEffect` 里 attach 的（`TableView.tsx:113-114`），重连这一刻客户端通常还没导航到 `/room/:roomId`，如果 server 端在处理重连时就主动 `emit("game:snapshot", ...)`，客户端监听器还没挂上，事件会丢。改成让 `room:enter` 的 ack 直接带数据，完全复用既有"ack = 快照"的架构约定（`session-mechanics.md` 架构铁律 5），客户端拿到 ack 后先把 view 灌进 store 再导航，`TableView` 挂载后走的是正常的后续事件监听，不存在竞态。
  - 未命中（座位不存在/不是宽限期内/已经是永久托管/房间不在 in-game）：走原有 `room:enter` 逻辑（当前实现——注册为房间连接、返回 `RoomInfo` 快照，不带 `view`），不报错。若命中的是"已经是永久托管"这种情况（宽限期已过），客户端约定行为是**不渲染 `TableView`**，直接提示"这局已经超时被 AI 接管"并给出返回 `/games` 的链接——现有架构里客户端从来没有"没有 `PlayerView` 也能画牌桌"的路径（唯一的全局视角是 dev-only 的 `debug:replayOmniscientView`，不进正式 UI），不必为这个边缘场景另造一种半吊子渲染模式。
- `docs/contracts/protocol-shared.md` §1 目前有一个已经写了但标注"MVP 阶段排除重连"的 `resume?: { roomId }` 握手字段——**这次不实现它，改用上面 `room:enter` 的 ack 承载重连数据**，文档需要把这条改写清楚（不是继续留一个悬空 TODO），避免以后有人以为还欠着这个字段没做。
- **广播新增三个房间事件**（`docs/contracts/protocol-shared.md`/`session-mechanics.md` §6 同步补充）：
  - `room:playerDisconnected { seat }`：宽限期开始。
  - `room:playerReconnected { seat }`：宽限期内成功抢回。
  - `room:playerAutoPiloted { seat }`：宽限期到期或主动离开导致的永久托管（无论是从宽限期转永久，还是像现在这样直接触发）——这是一个**新广播**，现状代码里 `markAutoPiloted` 完全没有对外广播，其他玩家看不出这一轮突然是 bot 出牌是怎么回事，这次顺便补上。
- **`PlayerSchema` 新增两个字段**（`packages/protocol/src/room-models.ts`）：`isAutoPiloted: boolean`（现在托管与否完全没有暴露给客户端）、`isDisconnected: boolean`（true 表示宽限期内，用于 UI 区分"掉线中，等待重连"vs"已转 AI 代打"两种态）。Lobby/座位列表/`PlayerBadge` 按这两个字段加提示文案（用户已确认需要"掉线中"提示）。

## 架构新增：账号级重复登录检测（用户点 1）

**现状缺口**：整个鉴权/房间模型完全没考虑同一账号并发多个连接。`RoomsGateway.seatOf()` 只按 `room.players[].userId === info.userId` 找座位，不检查"是不是当前绑定这个座位的那个 socket"——同一账号开两个标签页、都对同一房间调用过 `room:enter`/`room:join`，两边都能合法对同一座位发 `game:action`；而单播推送（`game:snapshot`/`game:event`）的 `ConnectionRegistry.seatSockets` 每个座位只记一个 socket，两个标签页里必然有一个收不到实时更新却仍能瞎操作。这是原有鉴权模型的固有性质，不是这次改动引入的新洞，但"刷新自动恢复登录"上线后会显著提高踩到它的概率。

**REST 还是 socket**：不用 REST。`apps/server/AGENTS.md` 明确"除 OAuth 外全走 Socket.IO，不引入 REST 层"，这是已定规则。现有 `apps/web/src/lib/socket.ts` 的 `connect()` 已经在用 Socket.IO 握手失败走 `connect_error` 带错误码回来的模式处理 `UNAUTHORIZED`/`VERSION_MISMATCH`——直接复用这套，不用新开一层。

**设计**：

- **新增 `SessionRegistry`**（`apps/server/src/gateway/session-registry.ts`）：`Map<userId, Socket>`，账号级、跟房间/座位无关（哪怕还没进任何房间也适用），跟现有房间/座位维度的 `ConnectionRegistry` 是两个独立的小 service，不合并（职责不同，`ConnectionRegistry` 自己的注释也强调不要往里塞无关概念）。
- **握手 `auth` payload 新增 `takeover?: boolean`**。`auth.middleware.ts` 校验完身份、`socket.data.userId` 确定之后（Supabase 分支和 JWT 分支共用同一段收尾逻辑，不要两个分支各写一遍）：
  - `SessionRegistry` 里这个 `userId` 没有活跃 socket → 正常放行，登记 `sessionRegistry.set(userId, socket)`。
  - 有活跃 socket 且 `!takeover` → `next(new WsAuthError("SESSION_EXISTS"))`（新错误码，加进 `packages/protocol/src/common.ts` 的 `ERROR_CODES` 数组，`WsAuthError.code` 联合类型同步加一项）。
  - 有活跃 socket 且 `takeover === true` → 先对旧 socket `emit("session:kicked", { reason: "takeover" })`，再 `oldSocket.disconnect(true)`，然后放行新连接、登记进 `SessionRegistry`。
  - 对应 socket 自身断开时要从 `SessionRegistry` 摘除，摘除前比较登记的是不是还是这个 socket 引用（避免"旧 socket 被踢之后才姗姗来迟触发自己的 disconnect 清理，把新连接的登记误删"这种竞态）。
- **踢旧 socket = 触发正常断线路径，不是"主动离开"**：`oldSocket.disconnect(true)` 走 Socket.IO 原生 `disconnect` 事件，跟"网络断开"完全同一条路径（`RoomsGateway.handleDisconnect` → 进入上面的断线宽限期），**不会**触发"主动 sign out/room:leave"那条立即永久 `isAutoPiloted` 的路径——接管场景里旧座位应该被新连接接过去，不该被判给 AI。新连接随后调用 `room:enter` 时，座位天然还处于"宽限期内"，直接命中重连分支拿回控制权，不需要另外写一套"原地立即接管"的特殊逻辑。
- **账号级去重顺带解决了重连竞态**：由于同一账号同一时刻只可能有一个活跃 socket，不会出现"两个标签页同时抢同一个座位重连"的竞态，`room:enter` 的重连命中逻辑不需要再加额外的并发保护。
- **`session:kicked` 投递是尽力而为**：`emit` 之后紧跟 `disconnect()`，网络投递不保证送达。旧 client 不能只依赖收到 `session:kicked` 才处理——要同时兜底监听 Socket.IO 原生 `disconnect` 事件，两者任一触发都执行同一套"清本地态 + 显示提示"逻辑，`session:kicked` 的 payload 只是用来把提示文案从"网络断开"细化成"已在别处登录"。
- **旧 client 不能调用真正的 `supabase.auth.signOut()`**：`apps/web/src/lib/supabase.ts` 的 `createClient` 没传任何 options，`persistSession`/`detectSessionInUrl` 都是默认值 `true`，同源多标签页共享 localStorage 里的同一份 session，Supabase 还会通过 `storage` 事件跨标签页广播登出——旧 tab 如果真调 `signOut()`，会把刚接管成功的新 tab 一起登出，自己打自己。旧 client 收到 kicked/disconnect 后只清空自己的内存态（Zustand `socket`/`room`），不碰共享的 Supabase/dev session token。
- **命名避免冲突**：`rooms.gateway.ts:286` 已经有一个 `room:kicked`（房主移除玩家用的，payload `{ reason: "removedByHost" }`），跟这次的 `session:kicked` 语义完全不同，不要复用/混淆。
- **旧 client UI 落点**：不新建路由，`navigate("/login", { state: { kicked: true } })`，`LoginView` 根据这个 state 在登录表单上方加一条可关闭的提示条（"您的账号已在其他设备接管，此处已退出"），登录表单本身照常可用。
- **三处 `connect()` 调用要共享同一套"检测冲突→询问→按需带 `takeover` 重连"逻辑**：`LoginView.tsx`（dev 昵称路径）、`AuthCallbackView.tsx`（OAuth 回调）、以及下面"Web auth bootstrap"新增的刷新自动登录，三处都需要在拿到 `SESSION_EXISTS` 时弹确认框、确认后带 `takeover:true` 重连。为避免重蹈"nickname 派生逻辑重复两份"的覆辙，收成一个共享 helper（建议 `apps/web/src/lib/socket.ts` 新增 `connectWithTakeoverPrompt(token)`，内部调 `connect()`，失败码是 `SESSION_EXISTS` 时弹确认、按结果决定是否带 `takeover:true` 重试），三个调用点都改成调这个 helper。
- **正常刷新场景下这套机制几乎不会触发**：浏览器刷新时旧页面的 socket 通常在新页面发起连接之前就已经断开、`SessionRegistry` 里的登记已经被清掉，所以刷新路径不会被误判成"重复登录"。存在一个极小概率的时序竞态（旧 socket 断开事件还没被 server 处理完、新连接就到了），触发时用户会看到一次多余的"是否接管"确认框——不是错误，接受即可，不做特殊规避。

## Implementation Changes

### Web auth bootstrap

- App 启动时调用 `supabase.auth.getSession()`。
- 恢复 access token 后重新连接 server。
- 使用 `onAuthStateChange` 同步登录状态。
- 增加 auth restoring 状态，恢复完成前 `RequireAuth` 不跳回 `/login`。
- 真实 Supabase session 由 Supabase client 持久化，走 Google 或 GitHub 任一 provider 效果一致（provider 差异只体现在下面"verified profile"的字段兜底上）。

### Sign out

- `signOut()` 改为异步操作：若当前在房间里，先 `ack(socket, "room:leave", {})`（best-effort，超时也继续往下走，不能卡住退出）；再等待 `supabase.auth.signOut()` 完成；再断开 socket、清理 Zustand 与本地持久化（真实 session 由 Supabase 自己清，dev 伪账号 session 需要手动清 localStorage）；最后导航到 `/login`。
- 清理当前房间恢复信息，避免退出后自动重新进入旧房间。
- 这一条同时满足用户点 2 的诉求："sign out 后直接托管（还有其他真人则代打，没有则关房）"——复用既有 `room:leave` 的 in-game 分支，不新增服务端逻辑。

### Verified profile（Google + GitHub）

- 只使用握手 token 经 Supabase 验证后的 `user_metadata`，不信任 payload 中的 userId、nickname 或 avatar（架构铁律 3 的延伸）。
- 昵称优先级：`user_metadata.user_name`（GitHub 的登录名）→ `name` → `full_name`（Google 常见字段）→ email 前缀 → `player`。
- avatar 优先级：`user_metadata.avatar_url` → `user_metadata.picture`（Google 部分场景只给 `picture`）。
- **消灭重复实现**：目前 `apps/server/src/gateway/auth.middleware.ts` 的 `deriveNickname`/`deriveAvatar` 和 `apps/web/src/views/AuthCallbackView.tsx` 里注释写着"Mirrors ... same fallback order"的同名函数各写了一份，容易改一处漏一处。改为：server 在握手验证通过后，把算好的 nickname/avatar 挂到 `socket.data`；`connect()` 成功后 web 端通过一次 ack（例如复用/扩展现有某个握手后首次查询，具体挂哪条消息实现时定）拿到 server 算好的值，不在 web 自己再算一遍。
- 将 verified nickname/avatar 放入 server socket identity，并用于 `room:create`、`room:join`、`room:enter`。
- **`defaultNickname(userId)` 不能直接删**：它是 dev/JWT 鉴权路径（`ConfigService` 未配置 Supabase 时）的必要兜底——那条路径的 `auth.middleware.ts` 分支目前完全不产出 nickname/avatar（`socket.data` 只有 `userId`）。改法：仅当 Supabase 分支验证成功、拿到真实 `user_metadata` 时才使用上面的优先级；JWT 分支继续用现有 `defaultNickname(userId)` 兜底（配合下面"dev nickname 账号"一节，dev 路径的 userId 本身会变成人可读的，`defaultNickname` 兜底出来的字符串也就不再是 UUID/HEX 观感）。
- avatar 沿 server room state、participant/player snapshot、room events 传到 web——这条基础设施已经打通（`packages/protocol` 的 `PlayerSchema`/`RoomParticipantSchema`/`RoomPlayerJoinedEventSchema` 已有 `avatar?: string` 字段，`apps/server/src/rooms/room.ts` 的 `Player` 类型也已有），实际工作量只是 `RoomService.join()` 签名加一个 `avatar` 参数、gateway 把验证出的 avatar 传进去，不是新建协议字段。
- Lobby、座位列表和牌桌 `PlayerBadge` 显示头像；没有头像时显示 nickname initials。

### Dev nickname 登录：改成有状态伪账号（新，用户点 3）

- **同名 = 同账号**：`apps/web/src/lib/devAuth.ts` 的 `deriveUserId` 目前对同一昵称每次都拼一个随机后缀，导致同名两次登录是两个不同 userId。改成确定性映射（例如 `dev:${slug}`，不加随机后缀），slug 碰撞（不同昵称清洗后撞同一个 slug）是已知且接受的行为，仅限 dev/e2e 场景。
- **不检查密码**：现状本来就没有密码校验，这条不用改代码，只是明确写进文档/注释，避免以后有人误以为要加一层校验。
- **登录状态持久化**：签发的 dev JWT 存 localStorage（复用"Web auth bootstrap"那条里为 dev 路径单独加的持久化），App 启动时若没有真实 Supabase session，就检查这个 key，有就直接 `connect(token)` 静默登录，不用户重新走登录表单。
- **超时策略：不过期**（用户已确认），只有显式 `signOut()` 才清除这个 localStorage key；`devAuth.ts` 签发的 JWT 本身也不带 `exp`（现状已经如此，不用改）。
- 这一条继续严格限定在 `import.meta.env.DEV`/未配置 `VITE_SUPABASE_URL` 的分支，不影响真实 OAuth 路径；`profiles` 表仍然不为 dev 账号写入（`session-mechanics.md` §11 现状说明保留）。

### Refresh restore

- 保存最后进入的 roomId 和当前页面上下文（真实 Supabase 登录用 localStorage，dev 伪账号同上）。
- 恢复登录后（真实 session 或 dev 伪账号）尝试 `room:enter`。
- `waiting` 状态恢复 lobby 快照（现状 `room:enter` 已支持，不用改）。
- `in-game` 状态：走上面"架构变更"里扩展过的 `room:enter`——60 秒宽限期内命中则真正拿回座位操控权，`room:enter` 的 ack 直接带上该座位的 `view`（不是单独的 `game:snapshot` 推送事件，原因见上）；宽限期已过则作为普通房间连接进入，`RoomInfo.players[mySeat].isAutoPiloted === true`，不渲染 `TableView`，提示"这局已被 AI 接管"并引导回 `/games`。
- `finished` 状态恢复房间结果/replay 入口（不涉及座位托管，风险最低，逻辑基本不用改）。
- 房间不存在、server 已重启时，保留登录状态，清除房间上下文，回到 `/games` 并显示恢复失败提示。
- server 重启后的 active room 不承诺恢复，因为当前房间实时状态仍是内存态；重连宽限期定时器同理只在进程存活期间有效。

### Documentation

- **先改** `docs/contracts/session-mechanics.md`：评审点 H 整段重写（宽限期 + 永久托管两态、新的三个事件、`PlayerSchema` 新字段），§6 消息表补 `room:playerDisconnected`/`room:playerReconnected`/`room:playerAutoPiloted`；再补一节说明账号级并发连接约束（`SessionRegistry`/`SESSION_EXISTS`/`session:kicked`/`takeover`）。
- `docs/contracts/protocol-shared.md` §1：把标注"MVP 阶段排除重连"的 `resume?: { roomId }` 握手字段改写成"重连改由 `room:enter` 的 ack 承载，这个字段不再规划实现"，握手 `auth` payload 补充说明新增的 `takeover?: boolean`；§5 错误码表补 `SESSION_EXISTS`。
- `docs/decisions.md`：当前最大编号是 D23，新增两条——**D24** 记评审点 H 的这次修订（断线不再立即永久托管，改 60 秒可逆宽限期）；**D25** 记账号级会话去重（`SessionRegistry` + 握手层 `connect_error("SESSION_EXISTS")` 拒绝 + `takeover` 确认接管，不引入 REST）。原决策标的是"已定：采纳"，D24 是对已定决策的正式变更，需要留痕，不能只改事实描述不留决策轨迹。
- 删除或改写"nickname 暂由 userId 派生"的过期说明（`plan.md` 待办里已经记了这条，一并勾掉）。
- 收工时更新 `docs/process/plan.md` 的进度和下一步动作。

## Test Plan

### Server

- auth middleware 测试 verified Google/GitHub metadata 的 nickname/avatar 提取（含 `user_name` 缺失回退到 `name`/`full_name`，avatar 缺 `avatar_url` 回退到 `picture` 的用例）；dev/JWT 路径不产出 verified profile、走 `defaultNickname` 兜底的用例。
- gateway/room 测试 `create`/`join`/`enter` 使用真实 profile，而不是 userId 派生值。
- 测试 avatar 出现在 room snapshot、participant event、player event。
- **断线宽限期**：
  - 断线后 60 秒内同一 userId 重连 → 座位拿回操控权、收到 `game:snapshot`、`isAutoPiloted`/`isDisconnected` 状态正确、广播 `room:playerReconnected`。
  - 断线后 60 秒内如果轮到该座位行动：对局停在那一步等待（不由 bot 代打），其他座位在此之前的正常行动不受影响；重连后该座位能正常提交 `game:action` 并推进。
  - 断线超过 60 秒未重连 → 转永久 `isAutoPiloted`，若当时正卡在该座位的回合，转永久的同时跑一次 `autoPlayBots` 接管这一步，广播 `room:playerAutoPiloted`；若此时房间已无真人 → 广播 `room:closed { reason: "allPlayersLeft" }`。
  - 宽限期内房间只剩这一个真人时**不应**提前关房（要等宽限期结束才判断）。
  - 宽限期内断线座位当前不是轮到它行动 → 其他座位正常出牌/吃碰杠，不受影响，`isDisconnected` 只影响这一个座位自己的可操作性。
  - 主动 `room:leave`/sign out 路径**不经过**宽限期，立即转永久托管（现状行为的回归测试，防止后续改动把这条路径也接进定时器）。
- 测试重连时是别的 userId（非原座位 userId）调用 `room:enter` 不会误抢座位（身份校验只信握手）。
- **账号级重复登录**（`SessionRegistry`）：
  - 单测：登记/查询/踢/断线摘除；"新连接已顶替旧登记后，旧 socket 才姗姗来迟触发自己的 disconnect 清理"不应误删新登记（比较引用后再删）。
  - e2e：用**同一个 token 开两个 `socket.io-client` 连接**（现有 `rooms.session.e2e-spec.ts` 的断线测试用的是 4 个不同用户，完全没覆盖这个场景）——第二个默认握手失败并带 `SESSION_EXISTS`；带 `takeover:true` 重连后，第一个收到 `session:kicked` 并被断开，第二个成功连接；若第一个当时占着一个 in-game 座位，第二个随后 `room:enter` 应命中重连分支、拿到该座位的 `view`。

### Web

- 测试 auth bootstrap 的 loading、成功恢复和失败降级。
- 测试 sign out：先发 `room:leave` 再等 Supabase signout 完成再清理本地状态；房间不存在/已离开等边界不阻塞退出流程。
- 测试刷新恢复真实登录（Google/GitHub）和 dev 伪账号登录。
- 测试 dev 伪账号"同名登录两次得到同一 userId"、"不设密码可直接登录"、"仅 logout 清除本地会话，刷新不掉线"。
- 测试头像显示与无头像 initials fallback（Google/GitHub 两种 metadata 形状）。
- 测试失效房间回到 `/games` 并显示提示。
- 测试"掉线中"/"AI 代打"两种状态在座位列表/`PlayerBadge` 上的展示区分。
- 测试 `connectWithTakeoverPrompt` 的三种结果：无冲突直连、确认接管成功、取消接管（新连接自行放弃，不影响旧连接）。
- 测试 `LoginView` 的 `kicked` 提示条渲染。
- e2e：复用现有 `loginAs(browser, nickname)` 模式，但在**同一个 browser context 里开两个 page**、用同一个昵称登录（dev 登录已经是确定性 userId，同名必然同账号，天然适合模拟这个场景，不需要额外造夹具）。

### Acceptance

使用当前本地 Supabase + Google/GitHub OAuth 手工验证：

1. Google 登录，显示 Google 昵称与 avatar；
2. GitHub 登录，显示 GitHub 用户名与 avatar；
3. 创建/加入房间；
4. 对局中刷新页面，60 秒内重新打开能拿回座位操控权，并能看到"掉线中"提示在刷新期间对其他玩家可见；
5. 对局中刷新页面但超过 60 秒才回来，座位已被 AI 接管，只能看不能操作；
6. sign out 后房间立即转托管（其他真人还在则继续代打，若自己是最后一个真人则房间关闭）；
7. sign out 后不能自动恢复，再次访问受保护页面回到 `/login`；
8. dev 昵称登录：同一昵称两次登录是同一账号，刷新页面保持登录，仅 logout 后需要重新登录；
9. 同一账号开两个标签页登录：第二个标签页弹出"是否接管"确认；确认后第一个标签页显示"已在其他设备接管"提示并回到登录页，第二个标签页正常进入（若原本在 in-game 房间中，能拿回座位操控权）；取消接管则第二个标签页放弃登录，第一个标签页完全不受影响。

完成后运行 `pnpm verify`。

core 未修改时不额外执行 core fuzz；断线宽限期改动只涉及 `apps/server` 的房间编排层，不触碰 `packages/core`，按 DoD 不需要额外 fuzz，但需要补上面列的 server 集成测试。

## Assumptions

- refresh restore 只保证 server 进程仍存活；server 重启后的 active room 不恢复，重连宽限期定时器也随进程重启一并失效。
- 60 秒宽限期长度先按用户给的数字定死为常量，不做成可配置项（超出本次修复范围）。
- dev 昵称"同名即同账号"且免密码，只在 `import.meta.env.DEV`/未配置 `VITE_SUPABASE_URL` 时可用，属于测试/本地开发专用后门，不会影响真实 OAuth 账号体系；因为免密码可被任意人冒用同名身份，仅限本地/CI 场景。
- Google/GitHub avatar 使用 Supabase 返回的 `avatar_url`/`picture`，不下载图片、不复制到本地存储。
- Google/GitHub OAuth client secret 保持在本地 `.env.development.local`，不提交到仓库。
- 断线宽限期是对评审点 H 的正式修订，不是"顺手改"——按根 `AGENTS.md` 护栏，设计变更已经先落到本文档 + 待写入 `session-mechanics.md`/`decisions.md`，实现前需要这些文档改动跟代码在同一 commit 落地。
- `session:kicked` 的投递是尽力而为，不保证到达；旧 client 的兜底依赖 Socket.IO 原生 `disconnect` 事件，不是只等这条自定义事件。
- 正常刷新场景下账号级冲突检测极小概率误触发（旧 socket 断开和新 socket 连接之间的时序竞态），误触发时用户看到的是一次多余的"是否接管"确认，不是错误，不做特殊规避。
- 账号级去重（`SessionRegistry`）跟房间级重连（`room:enter` 扩展）是两个独立机制：前者解决"同一账号同时只能有一个活跃连接"，后者解决"断线后如何拿回座位"；两者组合后不需要在 `room:enter` 里再加额外的并发保护。
