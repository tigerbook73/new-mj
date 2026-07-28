# apps/web AGENTS.md

本文件只约束 `apps/web`；根目录 `AGENTS.md` 的全局规则同样适用。

## package 职责

- web 是 core engine 的纯消费者：只依赖 `@new-mj/protocol` 的类型对接 `apps/server` 的 Socket.IO 协议，不 import `@new-mj/core`，不实现任何玩法规则（架构铁律 6）。`getLegalActions` 是 core 内部函数，web 拿不到；能拿到的只有 server 已经算好塞进 `PlayerView` 的 `myClaimOptions` 这类字段。
- UI 由 server 下发的 `PlayerView`（`myClaimOptions` 等 ruleset 自带字段）驱动，不在前端重新判断合法性——**这不是为了防泄密**（可见性过滤在事件下发时就做完了，前端懂不懂规则不影响谁能看到什么数据），纯粹是为了不让两份规则代码打架。要不要把这条边界正式确立成一层新的公共契约（PlayerView-only 的合法性/算分实现，web 提示和 AI 共用）在阶段 4.1 AI 落地时已经决定**不做**：AI 直接跑在 server 进程里拿完整 `state`，这层契约暂时还是口头约定不是结构性保证，留作已知技术债。
- 阶段 3 只接入 junk + bloodbattle 两个玩法的**通用骨架**牌桌（`PlayerViewBase` 公共字段）；阶段 4.7 把 junk 的牌桌 UI 重做成真实牌面+布局（见下方 `src/features/mahjong/`）。**Junk Table UX 专题（Phase 1–6）已全部完成，只覆盖 junk**；bloodbattle 仍停在通用骨架，玩法专属阶段 UI（血战定缺/换三张等）是独立的下一专题，尚未立项，见 `docs/process/plan.md` 待办。
- 阶段 3 用开发态假登录（本地签 JWT）；阶段 5 接入真正的 Supabase OAuth（Google/GitHub），`LoginView` 的开发态昵称表单没有删除，收进 `import.meta.env.DEV` 门控区块继续给 e2e 用。

## 代码约定

- 技术栈：Vite + React + TypeScript + React Router（v7+ 统一包 `react-router`，不装 `react-router-dom`）+ Tailwind CSS v4 + shadcn/ui（Base 组件库 + Nova 预设）+ Zustand + `motion`（Phase 5a 起，牌桌一次性入场动画；即改名后的 framer-motion，导入路径是 `motion/react` 不是 `framer-motion`）+ Vitest（单元）+ Playwright（e2e）+ Storybook React-Vite（麻将组件隔离验收）。均取最新稳定版，未来刷新时同样遵循 workflow.md「依赖维护」的规则。
- `tsconfig.json` 覆盖了根 `tsconfig.base.json` 的 `module`/`moduleResolution`（`NodeNext` → `ESNext`/`bundler`）：Vite 用 esbuild/rollup 自己做模块解析，`bundler` 模式才支持 `@/*` 别名与省略扩展名的导入，这是 Vite+React 项目的标准做法，不是随意偏离——类比 `apps/server` 对 ESM 的整体偏离，偏离原因写在这里而不是散落在代码注释里。
- `src/shared/ui/`（含 `src/shared/lib/utils.ts` 的 `cn()` helper）是 shadcn CLI `add` 生成的产物，**不手改**；需要改行为就重新走 `npx shadcn@latest add <component>` 或调 `components.json` 配置后重新生成。这个目录被 eslint 单独豁免了 `react-refresh/only-export-components` 规则（根 `eslint.config.mjs`，匹配 `**/shared/ui/**/*.tsx`），因为 shadcn 的 cva 变体导出模式本身就会触发这条规则。
- 目录按 feature 组织，不按技术类型分：`src/features/<name>/`（`mahjong`/`layout-sketch`/`auth`，各自拥有私有的 components/hooks/lib，只有真的跨 feature 复用才下沉到 `shared/`）；`src/shared/`（`ui`/`components`/`hooks`/`lib`/`store`，被 ≥2 个 feature 用到的东西才放这里）；`src/app/`（`App.tsx`/`main.tsx`/`router.tsx`/`index.css` 组合根 + `views/` 里还没长出私有逻辑的薄页面，比如目前的 `GamePickerView`/`LobbyView`/`ReplayView`）。`app/views/` 里的页面一旦开始积累自己专属的 components/hooks/lib，就晋升成 `features/` 下的独立目录，不要反过来把还很薄的页面提前拆成 feature。
- 目前不引入除 React Router 外的路由/状态管理库（Redux 等）；Zustand store 按域拆分而非合一——`shared/store/session.ts` 的 `useSessionStore`（session/房间/对局状态）和 `features/mahjong/tableLayout.store.ts` 的 `useTableLayoutStore`（只存纯展示的 `tileTheme`）故意分开，互不相关。
- 测试文件位置/命名遵循根 AGENTS.md 全局约定（`docs/testing-strategy.md` §1.1）：单元测试用 Vitest，e2e 用 Playwright；无 web 专属偏离。
- **e2e 测试里跳转路由一律用点击（触发 React Router 的客户端跳转），不要用 `page.goto("/lobby/...")`**：`page.goto` 是整页重新加载，会清空内存里的 Zustand session（`socket`/`userId`），受保护路由的 `loader`（见下）会把你弹回 `/login`——踩过一次坑，见 `test/lobby.e2e-spec.ts` 的写法。这条不影响故意用整页刷新去验证冷启动恢复路径的用例（如 `test/app.e2e-spec.ts` 里"refreshing while in ..."系列），那些测的就是刷新本身。
- `RoomInfo` 的成员/准备等非规则状态由进入 ack + 后续 room events 更新；`PlayerView` 则由开局/重连快照及每个已接受动作后的逐动作 `game:snapshot` 权威替换。不存在"重新查一次房间当前状态"的协议消息，也不允许拿命令 ack 当状态来源（架构铁律 5）——`room:ready`/`room:start`/`game:action` 的 ack 都是空对象 `{}`。
- **`game:event` 不重建规则状态**：Table 只记录已经过 visibility 过滤的原始事件，当前 `PlayerView` 统一经 `applyGameSnapshot({view,seq})` 更新；同局旧 seq 被丢弃，相同 seq 允许覆盖，`room:dealerChanged` 开启新的 seq epoch。Phase 5 加的事件动画**不消费 `game:event`**——`useIsIncrementalSnapshot(gameSeq)` 只看相邻两次快照的 `seq` 是否代表"活的、原地推进"，snapshot 本身仍是唯一权威来源；`game:event` 目前只喂 `TableView.tsx` 右下角的诊断日志。
- `game:advice` 在每个已接受 snapshot 后查询；store 只有在 seq、deadline 与发起时 snapshotRevision 全匹配时缓存响应。`ActionDock` 消费 `recommendedAction` 决定默认激活哪一组；任何新 snapshot 或 session/room reset 都先清旧 advice。
- e2e 端口隔离：`playwright.config.ts` 的 `webServer` 会自己拉起一对 web(5274)+server(3100) 进程，跟开发者手动跑的 `pnpm dev`（web 5173/server 3000）互不干扰；`JWT_SECRET` 两边都不显式设置，故意依赖 web 的开发态假登录和 server `ConfigService.jwtSecret` 共享同一个 `dev-only-insecure-secret` fallback，不需要额外协调。`apps/server` 的 `RoomsGateway` 已加 `cors: { origin: true }`（跨端口即跨 origin，Socket.IO 握手需要），非商用项目未涉及 cookie/凭据，用 `origin: true` 反射请求来源即可，不引入更复杂的白名单配置。
- **`webServer` 配置故意不用 `port`/`url`，改用 `wait: { stdout: <regex> }`**：只要配了 `port`/`url`，Playwright 无论 `reuseExistingServer` 是什么值都会先探测该端口/URL 判断"是否已有服务在跑"。本地沙盒环境里，连一个当前没人监听的端口不会像正常 loopback 那样立刻拿到拒绝，而是要挂起 2 分钟以上才返回 `ECONNREFUSED`（疑似 SYN 包被静默丢弃而非主动拒绝，逼 TCP 走满重试超时）——单一个占位测试因此要跑 4 到 5 分钟，且默认 `stdout` 不接管，终端上完全看不到任何进度，像是卡死。改成纯读子进程 stdout 匹配"Nest application successfully started"/Vite 的"Local: ..."作为就绪信号后，完全不走 socket 连接，同一条测试稳定在 5 到 8 秒内跑完。两个 webServer 条目都设了 `stdout: "ignore"`（而不是 `"pipe"`）——验证过 `wait.stdout` 的匹配是 Playwright 内部对输出流做的，不受这个开关影响，所以"ignore"照样能正确判定就绪，同时避免 NestJS/Vite 的常规启动日志混进测试报告；`stderr` 仍然 `"pipe"`，真出问题时还能看到。以后如果要新增别的 webServer 条目，同样用 `wait.stdout` + `stdout: "ignore"`，不要加 `port`/`url`。

## 代码地图

代码地图只记结构性索引 + 跨文件才看得出来的坑；单文件内的实现细节和取舍理由在对应文件的顶部/行内注释里，这里不重复。

- `src/app/`：组合根。`router.tsx` 是路由表，鉴权/恢复逻辑在 `protectedLoader()` 产出的 loader 里（不是包裹组件），页面组件本身分散在各 `features/*` 和 `app/views/`，路由表不关心页面属于哪个 feature。`views/` 只放还没长出私有 components/hooks/lib 的薄页面（晋升规则见「代码约定」），目前是 `GamePickerView`/`LobbyView`/`ReplayView`。
- `src/shared/`：只放被 ≥2 个 feature 复用的东西——`ui/`（shadcn 生成物，不手改）、`components/`（`RootLayout`/`ProtectedLayout`/`RouteHydrateFallback`/`RevalidateOnSessionLoss` 这类包住全部路由的 chrome）、`store/session.ts`（`useSessionStore`）、`lib/`（`socket.ts`/`sessionBootstrap.ts`/`theme.ts`/`supabase.ts`/`utils.ts`/`clientIdentity.ts`）。`lib/layoutPreset.ts`（Zone 几何框架）例外放这里而不是某个 feature，是因为它同时被 `features/mahjong` 和 `features/layout-sketch` 依赖。
- `src/features/mahjong/`：牌桌渲染域。`TableBoard.tsx` 是框架层，具体渲染由 `scenario.components[zone.id]` 查表决定，desktop 场景绑定在 `components/scenarios/`；其余牌面/动画组件的实现细节见各文件顶部注释。`layouts/` 子目录名被 `dev/layoutFilesPlugin.ts` 硬编码依赖（见该文件注释），改名要同步改那边。`lib/tableLayoutConfig.ts` 只保留 `TableLayoutConfig` 类型定义。
- `.storybook/` + `features/mahjong/components/*.stories.tsx`：麻将组件隔离验收，`pnpm --filter @new-mj/web storybook`，静态 build 已纳入 verify。
- `src/features/layout-sketch/`：开发态整桌参数实验室，仅 `import.meta.env.DEV` 注册，参数/草稿只存本地（localStorage + `features/mahjong/layouts/`），不接 socket/core。跟 `mahjong` 共享的只有 `shared/lib/layoutPreset.ts`；Lab 目前不编辑 `TableLayoutConfig`，只编辑 `layoutPreset.ts` 的 Zone 树，取舍见 `docs/architecture/frontend-layout.md` §4.3。
- `src/features/auth/`：登录/鉴权域。dev 假登录（`devAuth.ts`/`login-form.tsx`）和正式 Supabase OAuth（`social-login-form.tsx`）两条路径并存，取舍见 `LoginView` 的 `import.meta.env.DEV` 门控。
- `test/*.e2e-spec.ts`：Playwright e2e，`lobby.e2e-spec.ts`/`table.e2e-spec.ts` 用多 `browser.newContext()` 模拟多个真人玩家；`table.e2e-spec.ts` 里 junk 验证到真的发出一个 `discard` 并被接受，bloodbattle 只验证到公共骨架渲染（原因见「package 职责」）。

## apps/web DoD

- `pnpm --filter @new-mj/web verify` 全绿（typecheck/lint/test/test:e2e/build/build-storybook）。
- UI 改动除了自动化测试，还要在浏览器里实跑确认。
