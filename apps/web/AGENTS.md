# apps/web AGENTS.md

本文件只约束 `apps/web`；根 `AGENTS.md` 的全局规则同样适用。

## 职责与铁律

- web 只依赖 `@new-mj/protocol`，不 import `@new-mj/core`，不实现玩法规则。UI 由 server 下发的 `PlayerView`/`myClaimOptions` 驱动。
- `PlayerView` 只能由入局/重连快照和 `game:snapshot` 更新；命令 ack 只作回执，`game:event` 不重建规则状态。旧 `seq` 丢弃，同一 `seq` 可覆盖，换局开启新 epoch。
- junk 已有真实牌桌；bloodbattle 只有公共骨架。正式 OAuth 与仅 DEV/e2e 使用的假登录并存。

## 结构与约定

- `src/app/` 是组合根与薄页面；`src/features/<name>/` 拥有 feature 私有代码；`src/shared/` 只放被至少两个 feature 复用的 UI、组件、hook、lib、store。薄页面积累专属逻辑后再晋升为 feature。
- `shared/ui/` 是 shadcn 生成物，不手改；行为变化通过 shadcn/`components.json` 重新生成。
- Zustand 按域拆分：`shared/store/session.ts` 是会话/房间/对局，`features/mahjong/tableLayout.store.ts` 只存展示偏好。
- `router.tsx` 的 loader 负责鉴权和恢复；e2e 的常规路由跳转用点击，不用 `page.goto()`，避免整页刷新清空内存 session。故意测试冷启动恢复时例外。
- Playwright 自启 web(5274)+server(3100)，与 `pnpm dev` 隔离；使用 `wait.stdout` 判定就绪，不新增 `port`/`url` 探测。
- `pnpm test:e2e` 只跑未标 `@slow`/`@lab` 的用例（日常提交用）；`pnpm test:e2e:full` 跑全部（合并到 main 前用），策略见 `docs/process/workflow.md`。给低边际/慢速用例打 `{ tag: "@slow" }` 时判断依据是"是否已被同文件内更快的用例覆盖同一机制"，不是单纯按耗时。
- `test/layout-lab-*.e2e-spec.ts`（按编辑面/Tree/Grid+变量/视图与面板/预设与文件分成 5 个文件，每个文件顶层 `test.describe(..., { tag: "@lab" }, ...)` 包裹）只测 `features/layout-sketch`（仅 DEV 工具，不接 socket/core），日常提交不跑；改这个 feature 时手动跑 `pnpm test:e2e:lab`，合并到 main 前的 `test:e2e:full` 仍会跑到。新增 layout-sketch 专属用例按主题归入既有文件，或新开 `layout-lab-*.e2e-spec.ts` 文件并同样打 `@lab`。
- 本 workspace 下用 pnpm 10.33.3 通过 `--` 给脚本透传参数会被静默吞掉（如 `pnpm test:e2e -- test/foo.e2e-spec.ts` 实际仍跑全量套件）；直接不带 `--` 传参（`pnpm test:e2e test/foo.e2e-spec.ts`）或用 `pnpm exec playwright test test/foo.e2e-spec.ts`。

## 代码地图

- `features/mahjong/`：Junk 牌桌；`TableBoard` 消费 `TableScenario`，桌面绑定在 `components/scenarios/`。布局边界见 `docs/architecture/frontend-layout.md`。
- `features/layout-sketch/`：仅 DEV 的布局编辑器；与 mahjong 共享 `shared/lib/layoutPreset.ts`，不接 socket/core。
- `features/auth/`：OAuth 与开发态登录；`shared/lib/sessionBootstrap.ts`/`socket.ts` 是连接恢复与传输入口。
- `app/views/`：尚未拥有私有 feature 的页面；`test/*.e2e-spec.ts`：Playwright 端到端测试。

## DoD

- `pnpm --filter @new-mj/web verify` 全绿。
- UI 改动还须在浏览器实跑确认。
