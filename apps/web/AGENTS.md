# apps/web AGENTS.md

本文件只约束 `apps/web`；根目录 `AGENTS.md` 的全局规则同样适用。

## package 职责

- web 是 core engine 的纯消费者：只依赖 `@new-mj/protocol` 的类型对接 `apps/server` 的 Socket.IO 协议，不 import `@new-mj/core`，不实现任何玩法规则（架构铁律 6）。`getLegalActions` 是 core 内部函数，web 拿不到；能拿到的只有 server 已经算好塞进 `PlayerView` 的 `myClaimOptions` 这类字段。
- UI 由 server 下发的 `PlayerView`（`myClaimOptions` 等 ruleset 自带字段）驱动，不在前端重新判断合法性——**这不是为了防泄密**（可见性过滤在事件下发时就做完了，前端懂不懂规则不影响谁能看到什么数据），纯粹是为了不让两份规则代码打架。要不要把这条边界正式确立成一层新的公共契约（PlayerView-only 的合法性/算分实现，web 提示和 AI 共用）在阶段 4.1 AI 落地时已经决定**不做**（`decisions.md` D21）：AI 直接跑在 server 进程里拿完整 `state`，这层契约暂时还是口头约定不是结构性保证，留作已知技术债。
- 阶段 3 只接入 junk + bloodbattle 两个玩法的**通用骨架**牌桌（`PlayerViewBase` 公共字段）；阶段 4.7 把 junk 的牌桌 UI 重做成真实牌面+布局（见下方 `src/components/mahjong/`），bloodbattle 仍停在通用骨架，玩法专属阶段 UI（血战定缺/换三张等）留到阶段 6。
- 阶段 3 用开发态假登录（本地签 JWT，见 `docs/decisions.md` D16）；阶段 5 接入真正的 Supabase OAuth（Google/GitHub），`LoginView` 的开发态昵称表单没有删除，收进 `import.meta.env.DEV` 门控区块继续给 e2e 用（见 `docs/decisions.md` D22）。

## 代码约定

- 技术栈：Vite + React + TypeScript + React Router（v7+ 统一包 `react-router`，不装 `react-router-dom`）+ Tailwind CSS v4 + shadcn/ui（Base 组件库 + Nova 预设）+ Zustand + Vitest（单元）+ Playwright（e2e）。均取最新稳定版，未来刷新时同样遵循 workflow.md「依赖维护」的规则。
- `tsconfig.json` 覆盖了根 `tsconfig.base.json` 的 `module`/`moduleResolution`（`NodeNext` → `ESNext`/`bundler`）：Vite 用 esbuild/rollup 自己做模块解析，`bundler` 模式才支持 `@/*` 别名与省略扩展名的导入，这是 Vite+React 项目的标准做法，不是随意偏离——类比 `apps/server` 对 ESM 的整体偏离（D13），偏离原因写在这里而不是散落在代码注释里。
- `src/components/ui/`（含 `src/lib/utils.ts` 的 `cn()` helper）是 shadcn CLI `add` 生成的产物，**不手改**；需要改行为就重新走 `npx shadcn@latest add <component>` 或调 `components.json` 配置后重新生成。这个目录被 eslint 单独豁免了 `react-refresh/only-export-components` 规则（根 `eslint.config.mjs`），因为 shadcn 的 cva 变体导出模式本身就会触发这条规则。
- `src/lib/`：非 UI 的纯逻辑（socket 连接封装、开发态鉴权等）。`src/store/`：Zustand store。`src/views/`：路由级页面组件。`src/router.tsx`：路由表。
- 目前不引入除 React Router 外的路由/状态管理库（Redux 等）；Zustand store 有 `useSessionStore`（session/房间/对局状态）和 `useTableLayoutStore`（阶段 4.7 新增，只管牌桌缩放的 `tileUnit`，跟 session 状态无关故意分开，见下）。
- 测试文件位置/命名遵循根 AGENTS.md 全局约定（`docs/testing-strategy.md` §1.1）：单元测试用 Vitest，e2e 用 Playwright；无 web 专属偏离。
- **e2e 测试里跳转路由一律用点击（触发 React Router 的客户端跳转），不要用 `page.goto("/lobby/...")`**：`page.goto` 是整页重新加载，会清空内存里的 Zustand session（`socket`/`userId`），受保护路由的 `loader`（见下）会把你弹回 `/login`——踩过一次坑，见 `test/lobby.e2e-spec.ts` 的写法。这条不影响故意用整页刷新去验证冷启动恢复路径的用例（如 `test/app.e2e-spec.ts` 里"refreshing while in ..."系列），那些测的就是刷新本身。
- `RoomInfo` 的成员/准备等非规则状态由进入 ack + 后续 room events 更新；`PlayerView` 则由开局/重连快照及每个已接受动作后的逐动作 `game:snapshot` 权威替换。不存在"重新查一次房间当前状态"的协议消息，也不允许拿命令 ack 当状态来源（架构铁律 5）——`room:ready`/`room:start`/`game:action` 的 ack 都是空对象 `{}`。
- **`game:event` 不重建规则状态**：Table 只记录已经过 visibility 过滤的原始事件，当前 `PlayerView` 统一经 `applyGameSnapshot({view,seq})` 更新；同局旧 seq 被丢弃，相同 seq 允许覆盖，`room:dealerChanged` 开启新的 seq epoch。阶段 6 加动画时，event 驱动非权威动画，snapshot 仍是最终权威。
- `game:advice` 在每个已接受 snapshot 后查询；store 只有在 seq、deadline 与发起时 snapshotRevision 全匹配时缓存响应。Phase 3 不显示建议，Phase 5 才消费；任何新 snapshot 或 session/room reset 都先清旧 advice。
- e2e 端口隔离：`playwright.config.ts` 的 `webServer` 会自己拉起一对 web(5274)+server(3100) 进程，跟开发者手动跑的 `pnpm dev`（web 5173/server 3000）互不干扰；`JWT_SECRET` 两边都不显式设置，故意依赖 web 的开发态假登录（D16）和 server `ConfigService.jwtSecret` 共享同一个 `dev-only-insecure-secret` fallback，不需要额外协调。`apps/server` 的 `RoomsGateway` 已加 `cors: { origin: true }`（跨端口即跨 origin，Socket.IO 握手需要），非商用项目未涉及 cookie/凭据，用 `origin: true` 反射请求来源即可，不引入更复杂的白名单配置。
- **`webServer` 配置故意不用 `port`/`url`，改用 `wait: { stdout: <regex> }`**：只要配了 `port`/`url`，Playwright 无论 `reuseExistingServer` 是什么值都会先探测该端口/URL 判断"是否已有服务在跑"。本地沙盒环境里，连一个当前没人监听的端口不会像正常 loopback 那样立刻拿到拒绝，而是要挂起 2 分钟以上才返回 `ECONNREFUSED`（疑似 SYN 包被静默丢弃而非主动拒绝，逼 TCP 走满重试超时）——单一个占位测试因此要跑 4 到 5 分钟，且默认 `stdout` 不接管，终端上完全看不到任何进度，像是卡死。改成纯读子进程 stdout 匹配"Nest application successfully started"/Vite 的"Local: ..."作为就绪信号后，完全不走 socket 连接，同一条测试稳定在 5 到 8 秒内跑完。两个 webServer 条目都设了 `stdout: "ignore"`（而不是 `"pipe"`）——验证过 `wait.stdout` 的匹配是 Playwright 内部对输出流做的，不受这个开关影响，所以"ignore"照样能正确判定就绪，同时避免 NestJS/Vite 的常规启动日志混进测试报告；`stderr` 仍然 `"pipe"`，真出问题时还能看到。以后如果要新增别的 webServer 条目，同样用 `wait.stdout` + `stdout: "ignore"`，不要加 `port`/`url`。

## 代码地图

- `src/main.tsx`：入口，挂载 `<App/>`。
- `src/App.tsx`：只剩系统黑暗模式监听 + 挂载 `<RouterProvider/>`——不做任何连接/恢复逻辑了（阶段 5 曾经有过一个 bootstrap `useEffect`，D28 之后整个挪进了 `router.tsx` 的 `loader`，见下）。`<ThemeToggle/>` 未在任何地方渲染（含此文件），是一段已知未接线的既存组件，跟本次改动无关，不在这里补线。
- `src/router.tsx`：路由表 + 每个受保护路由的 `loader`（`/login` `/auth/callback` `/games` `/lobby/:roomId` `/room/:roomId` `/replay/:roomId/:gameNumber`）。鉴权/恢复不再是一个包裹组件（`RequireAuth` 已删除），而是 `protectedLoader()` 工厂产出的 loader：挂载前调 `ensureConnected()`（`lib/sessionBootstrap.ts`），失败就 `redirect("/login")`，成功则继续比对 server-truth 的当前活跃房间跟这个路由的 `:roomId` 是否一致，不一致就 `redirect()` 到真正该去的地方，组件不会渲染出中间态。`/login` 自己也挂了 loader（`ensureConnected()` 成功就跳 `/games`，不显示表单）；`/auth/callback` 是唯一不走 `ensureConnected()` 的例外（OAuth token 来源和 takeover 语义都不同，见 `session-mechanics.md` §12）。
- `src/components/RootLayout.tsx`：包住全部路由的根布局，挂 `<RevalidateOnSessionLoss/>`（桥接 socket 生命周期事件到 `useRevalidator()`，见下）+ 用 `useNavigation()` 给每次 loader 等待期加一层轻量遮罩。`src/components/RouteHydrateFallback.tsx`：只用于冷启动首次渲染前那段没有"上一页面"可保留的等待期（路由 `HydrateFallback`）。`src/components/ProtectedLayout.tsx`：`/games`/`/lobby`/`/room`/`/replay` 共用的纯 chrome 包装（`<SignOutButton/>`），本身不做鉴权判断（那是 loader 的职责）。`src/components/RevalidateOnSessionLoss.tsx`：监听 `store.socket` 从有变没有（被踢/断线），调用 `useRevalidator().revalidate()` 强制当前路由的 loader 重新判断——全应用唯一一处为"状态变化但没有发生导航"这种情形触发路由决策的地方。
- `src/store/session.ts`：`useSessionStore`（socket 实例、用户、房间、`PlayerView`、单局 `gameSeq`、绝对时间 `gameDeadline`、`kicked` 标记、`activeRoomHint` 这个 `session:identity` 给的轻量恢复线索——一旦 `setRoom()` 真正拿到完整 `RoomInfo` 就会清掉，避免过期线索把人带回已经离开的房间）；`applyGameSnapshot` 是 PlayerView/deadline 唯一写入口，房间成员/准备状态继续用对应 room event action 增量更新。客户端不得在 deadline 本地归零时自行提交 pass。
- `src/store/tableLayout.ts`：`useTableLayoutStore`（阶段 4.7 新增），只存一个 `tileUnit`（牌桌容器宽度换算出的缩放单位，由 `TableView` 的 `ResizeObserver` 写入），`src/components/mahjong/Tile.tsx` 读它算最终像素尺寸；跟 `useSessionStore` 无关故意分开建 store。
- `src/lib/`：`socket.ts`（连接 + ack/事件封装，含 `unwrapRoomEnterAck`/`describeConnectError` 两个共享小 helper）、`sessionBootstrap.ts`（D28 新增，`ensureConnected`/`doConnect`/`establishSession`——见上方 router.tsx 条目）、`devAuth.ts`（开发态假登录 + `readDevSession`/`writeDevSession`/`clearDevSession` 这三个 `"new-mj:dev-session"` localStorage key 的唯一读写口）、`theme.ts`（黑暗模式：`getInitialTheme` 读 localStorage，没有则退回 `prefers-color-scheme`；`applyTheme` 切 `.dark` class 并持久化，`main.tsx` 在挂载 React 前先调一次避免首屏闪烁）、`mahjongTiles.ts`（阶段 4.7 新增，TileId→牌面 SVG 文件名映射，本地复制了一份 `TILE_KINDS` 静态换算表，这是公开的换算公式不是规则代码，不违反不 import `@new-mj/core`）、`seatLayout.ts`（阶段 4.7 新增，`seatAt(mySeat, direction)` 把绝对 `SeatId` 换算成"我下方/左/上/右"的相对方向）、`supabase.ts`（阶段 5 新增，`SupabaseClient | undefined`——`createClient` 对空字符串 URL 会**同步抛错**，不像 server 侧的 `jwtSecret` 能给一个安全的开发态默认值，所以未配置时导出 `undefined` 而不是一个假客户端，调用方必须显式处理"没配置"这个分支，见 `LoginView`/`AuthCallbackView`/`store/session.ts` 的用法）。
- `src/views/`：`LoginView`/`GamePickerView`/`LobbyView`/`TableView`/`ReplayView`/`AuthCallbackView`。`GamePickerView` 负责玩法 Tabs、`lobby:list`、搜索和建房；`LobbyView` 使用 `/lobby/:roomId` 的 `room:peek`，支持指定座位入座/加 bot/离开；`TableView` 对 junk 用真实牌面+布局渲染（阶段 4.7 重做，见 `src/components/mahjong/`），bloodbattle 仍只渲染 `PlayerViewBase` 公共骨架，不按 `rulesetId` 分支具体规则 UI，血战定缺/换三张这类专属阶段没有对应操作按钮，卡在那个阶段发不出动作是预期行为；`ReplayView`（阶段 4.5 新增，`/replay/:roomId/:gameNumber`）逐事件步进回放已结束的对局，JSON-only 渲染不复用 `mahjong/` 牌面组件；`AuthCallbackView`（阶段 5 新增，`/auth/callback`）D28 之后是纯展示组件，不再自己发起 connect——`router.tsx` 的 `authCallbackLoader` 接住 `signInWithOAuth` 的重定向、读 Supabase session、`connectWithTakeoverPrompt()`，这个组件只负责把 loader 返回的错误信息（如果有）渲染出来。
- `src/components/mahjong/`：阶段 4.7 新增的牌桌视觉组件，跟 `components/ui/`（shadcn 生成物）和顶层 app-shell 组件分开。`Tile.tsx`（单张牌，cva 变体处理 selected/disabled 等状态，尺寸从 `useTableLayoutStore` 读）、`HandRow.tsx`（一个座位的手牌区）、`DiscardPile.tsx`（一个座位的牌河，`DiscardEntry.claimedBy` 的墓碑用变暗/删除线表示，不从数组移除）、`MeldGroup.tsx`（一个座位的副露）、`PlayerBadge.tsx`（座位信息卡片）、`WallStack.tsx`（纯装饰牌墙层，只吃 `wallCount`，不涉及任何具体牌身份）。
- `src/components/ThemeToggle.tsx`：固定右上角的黑暗模式切换按钮，本地 `useState` + `useEffect` 调 `theme.ts`，不进 Zustand store（跟 session 状态无关，不需要跨组件同步）。
- `src/components/login-form.tsx`：shadcn `login-03` block 生成后手动改的产物（block 不是 `ui/` 基础组件，改动是预期用法）——去掉了原版的邮箱密码字段/条款页脚，改成单一昵称输入，实际登录逻辑（`devAuth`/`connect`/`navigate`）仍留在 `LoginView` 里，这个文件只管展示。阶段 5：只在 `LoginView` 的 `import.meta.env.DEV` 区块里渲染，是 dev/e2e-test-only 的登录路径，不是主入口——原版自带的社交登录按钮当初为配合这个昵称表单被去掉，阶段 5 在 `social-login-form.tsx` 里接回真正的 OAuth，见下。
- `src/components/social-login-form.tsx`（阶段 5 新增）：`LoginView` 的主登录入口，Google/GitHub 两个按钮调 `supabase.auth.signInWithOAuth`；`supabase` 未配置（`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 为空）时按钮仍渲染，点击后内联报错而不是崩溃。
- `src/components/ui/`：shadcn 生成的基础组件，`login-03` 引入时新增了 `card.tsx`/`label.tsx`/`separator.tsx`/`field.tsx`（`separator.tsx` 目前没在用，block 自带、留着无害）。
- `test/*.e2e-spec.ts`：Playwright e2e 用例，`lobby.e2e-spec.ts`/`table.e2e-spec.ts` 用多 `browser.newContext()` 模拟多个真人玩家；`table.e2e-spec.ts` 里 junk 验证到真的发出一个 `discard` 并被接受，bloodbattle 只验证到公共骨架渲染（原因见上一条）。

## apps/web DoD

- `pnpm --filter @new-mj/web verify` 全绿（typecheck/lint/test/test:e2e/build）。
- UI 改动除了自动化测试，还要在浏览器里实跑确认。
