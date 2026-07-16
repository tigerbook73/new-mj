# apps/web AGENTS.md

本文件只约束 `apps/web`；根目录 `AGENTS.md` 的全局规则同样适用。

## package 职责

- web 是 core engine 的纯消费者：只依赖 `@new-mj/protocol` 的类型对接 `apps/server` 的 Socket.IO 协议，不 import `@new-mj/core`，不实现任何玩法规则（架构铁律 6）。`getLegalActions` 是 core 内部函数，web 拿不到；能拿到的只有 server 已经算好塞进 `PlayerView` 的 `myClaimOptions` 这类字段。
- UI 由 server 下发的 `PlayerView`（`myClaimOptions` 等 ruleset 自带字段）驱动，不在前端重新判断合法性——**这不是为了防泄密**（可见性过滤在事件下发时就做完了，前端懂不懂规则不影响谁能看到什么数据），纯粹是为了不让两份规则代码打架；`packages/ai` 立项前要不要把这条边界正式确立成一层新的公共契约（PlayerView-only 的合法性/算分实现，web 提示和 AI 共用），见 `../../docs/process/plan.md` 待办，阶段 4 AI 开工前定。
- 阶段 3 只接入 junk + bloodbattle 两个玩法的**通用骨架**牌桌（`PlayerViewBase` 公共字段），玩法专属阶段 UI（血战定缺/换三张等）留到阶段 5。
- 阶段 3 用开发态假登录（本地签 JWT，见 `docs/decisions.md` D16），不接入真正的 Supabase OAuth。

## 代码约定

- 技术栈：Vite + React + TypeScript + React Router（v7+ 统一包 `react-router`，不装 `react-router-dom`）+ Tailwind CSS v4 + shadcn/ui（Base 组件库 + Nova 预设）+ Zustand + Vitest（单元）+ Playwright（e2e）。均取最新稳定版，未来刷新时同样遵循 workflow.md「依赖维护」的规则。
- `tsconfig.json` 覆盖了根 `tsconfig.base.json` 的 `module`/`moduleResolution`（`NodeNext` → `ESNext`/`bundler`）：Vite 用 esbuild/rollup 自己做模块解析，`bundler` 模式才支持 `@/*` 别名与省略扩展名的导入，这是 Vite+React 项目的标准做法，不是随意偏离——类比 `apps/server` 对 ESM 的整体偏离（D13），偏离原因写在这里而不是散落在代码注释里。
- `src/components/ui/`（含 `src/lib/utils.ts` 的 `cn()` helper）是 shadcn CLI `add` 生成的产物，**不手改**；需要改行为就重新走 `npx shadcn@latest add <component>` 或调 `components.json` 配置后重新生成。这个目录被 eslint 单独豁免了 `react-refresh/only-export-components` 规则（根 `eslint.config.mjs`），因为 shadcn 的 cva 变体导出模式本身就会触发这条规则。
- `src/lib/`：非 UI 的纯逻辑（socket 连接封装、开发态鉴权等）。`src/store/`：Zustand store。`src/views/`：路由级页面组件。`src/router.tsx`：路由表。
- 目前不引入除 React Router 外的路由/状态管理库（Redux 等）；Zustand store 只有一个 `useSessionStore`，规模到需要跨模块拆分时再评估。
- 测试文件命名：单元测试贴近实现放 `src/`（`*.test.tsx`/`*.test.ts`，Vitest）；e2e 测试放 `test/*.e2e-spec.ts`（Playwright，与 `apps/server` 的 `test/*.e2e-spec.ts` 命名一致）。
- **e2e 测试里跳转路由一律用点击（触发 React Router 的客户端跳转），不要用 `page.goto("/lobby/...")`**：`page.goto` 是整页重新加载，会清空内存里的 Zustand session（`socket`/`userId`），`RequireAuth` 守卫会把你弹回 `/login`——踩过一次坑，见 `test/lobby.e2e-spec.ts` 的写法。
- `RoomInfo`/`PlayerView` 等房间与对局状态**只能靠 ack 的初始快照 + 后续事件增量更新**（`applyPlayerJoined`/`applyReadyChanged` 这类 store action），不存在"重新查一次房间当前状态"的协议消息，也不允许拿命令 ack 当状态来源（架构铁律 5）——`room:ready`/`room:start` 的 ack 都是空对象 `{}`，真正的状态变化只能等 `room:readyChanged`/`game:snapshot` 广播/单播。
- **`game:event` 只处理"事实型"事件，不处理"规则型"事件**：`apps/server` 的 `applyPlayerAction` 只广播原始 `game:event`（每次动作后**不会**重发 `game:snapshot`），而"怎么从事件流正确重建 PlayerView"这份逻辑（`rebuildPlayerView`）是按玩法分开写在 core 里的，web 不让 import。折中方案：`TableView` 只对"客观事实、跟规则无关"的事件类型（`TurnStarted`/`TileDiscarded`/`ClaimWindowOpened`/`ClaimWindowResolved`——谁的回合、谁打了什么牌、我能声明什么）做增量更新（`applyTurnStarted` 等 store action）；吃/碰/杠成立、胡牌、结算这类真正需要"判断"的事件只记一行日志，不解析、不试图还原画面，等下一次 `game:snapshot`（下一局开始）整体对齐。这不是数据泄露顾虑（可见性过滤已经在事件下发时做完），纯粹是不想在前端重新实现规则判断。
- e2e 端口隔离：`playwright.config.ts` 的 `webServer` 会自己拉起一对 web(5274)+server(3100) 进程，跟开发者手动跑的 `pnpm dev`（web 5173/server 3000）互不干扰；`JWT_SECRET` 两边都不显式设置，故意依赖 web 的开发态假登录（D16）和 server `ConfigService.jwtSecret` 共享同一个 `dev-only-insecure-secret` fallback，不需要额外协调。`apps/server` 的 `RoomsGateway` 已加 `cors: { origin: true }`（跨端口即跨 origin，Socket.IO 握手需要），非商用项目未涉及 cookie/凭据，用 `origin: true` 反射请求来源即可，不引入更复杂的白名单配置。
- **`webServer` 配置故意不用 `port`/`url`，改用 `wait: { stdout: <regex> }`**：只要配了 `port`/`url`，Playwright 无论 `reuseExistingServer` 是什么值都会先探测该端口/URL 判断"是否已有服务在跑"。本地沙盒环境里，连一个当前没人监听的端口不会像正常 loopback 那样立刻拿到拒绝，而是要挂起 2 分钟以上才返回 `ECONNREFUSED`（疑似 SYN 包被静默丢弃而非主动拒绝，逼 TCP 走满重试超时）——单一个占位测试因此要跑 4 到 5 分钟，且默认 `stdout` 不接管，终端上完全看不到任何进度，像是卡死。改成纯读子进程 stdout 匹配"Nest application successfully started"/Vite 的"Local: ..."作为就绪信号后，完全不走 socket 连接，同一条测试稳定在 5 到 8 秒内跑完。两个 webServer 条目都设了 `stdout: "ignore"`（而不是 `"pipe"`）——验证过 `wait.stdout` 的匹配是 Playwright 内部对输出流做的，不受这个开关影响，所以"ignore"照样能正确判定就绪，同时避免 NestJS/Vite 的常规启动日志混进测试报告；`stderr` 仍然 `"pipe"`，真出问题时还能看到。以后如果要新增别的 webServer 条目，同样用 `wait.stdout` + `stdout: "ignore"`，不要加 `port`/`url`。

## 代码地图

- `src/main.tsx`：入口，挂载 `<App/>`。
- `src/App.tsx`：挂载 `RouterProvider` + 全局 `<ThemeToggle/>`（不放进任何路由，所有页面都要看得到）。
- `src/router.tsx`：路由表（`/login` `/games` `/lobby/:roomId` `/room/:roomId`），`/games` 及以后的路由都包了 `RequireAuth`。
- `src/components/RequireAuth.tsx`：未登录（`store.socket` 为空）重定向回 `/login`；单独成文件是因为和 `router.tsx` 放一起会触发 `react-refresh/only-export-components`（路由表本身不是组件导出）。
- `src/store/session.ts`：`useSessionStore`（socket 实例、用户、房间、`PlayerView`），`applyPlayerJoined`/`applyReadyChanged`/`applyTurnStarted`/`applyTileDiscarded`/`applyClaimWindowOpened`/`applyClaimWindowResolved` 是给事件监听器用的增量更新 action。
- `src/lib/`：`socket.ts`（连接 + ack/事件封装）、`devAuth.ts`（开发态假登录）、`theme.ts`（黑暗模式：`getInitialTheme` 读 localStorage，没有则退回 `prefers-color-scheme`；`applyTheme` 切 `.dark` class 并持久化，`main.tsx` 在挂载 React 前先调一次避免首屏闪烁）。
- `src/views/`：`LoginView`/`GamePickerView`/`LobbyView`/`TableView`。`GamePickerView` 负责玩法 Tabs、`lobby:list`、搜索和建房；`LobbyView` 使用 `/lobby/:roomId` 的 `room:peek`，支持指定座位入座/加 bot。`TableView` 只渲染 `PlayerViewBase` 公共骨架，不按 `rulesetId` 分支，血战定缺/换三张这类专属阶段没有对应 UI，卡在那个阶段发不出动作是预期行为。
- `src/components/ThemeToggle.tsx`：固定右上角的黑暗模式切换按钮，本地 `useState` + `useEffect` 调 `theme.ts`，不进 Zustand store（跟 session 状态无关，不需要跨组件同步）。
- `src/components/login-form.tsx`：shadcn `login-03` block 生成后手动改的产物（block 不是 `ui/` 基础组件，改动是预期用法）——去掉了原版的社交登录按钮/邮箱密码字段/条款页脚，改成单一昵称输入，实际登录逻辑（`devAuth`/`connect`/`navigate`）仍留在 `LoginView` 里，这个文件只管展示。
- `src/components/ui/`：shadcn 生成的基础组件，`login-03` 引入时新增了 `card.tsx`/`label.tsx`/`separator.tsx`/`field.tsx`（`separator.tsx` 目前没在用，block 自带、留着无害）。
- `test/*.e2e-spec.ts`：Playwright e2e 用例，`lobby.e2e-spec.ts`/`table.e2e-spec.ts` 用多 `browser.newContext()` 模拟多个真人玩家；`table.e2e-spec.ts` 里 junk 验证到真的发出一个 `discard` 并被接受，bloodbattle 只验证到公共骨架渲染（原因见上一条）。

## apps/web DoD

- `pnpm --filter @new-mj/web verify` 全绿（typecheck/lint/test/test:e2e/build）。
- UI 改动除了自动化测试，还要在浏览器里实跑确认。
