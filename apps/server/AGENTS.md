# apps/server AGENTS.md

本文件只约束 `apps/server`；根目录 `AGENTS.md` 的全局规则同样适用。

## package 职责

- server 是 core engine 与客户端之间的编排/传输中介：房间生命周期、Socket.IO 网关、鉴权、按可见性分发事件。
- 禁止在 server 里实现任何玩法规则（D12 铁律）；server 只把 `config.rulesetId` 当不透明字符串传给 core，不做规则分支判断。
- 除 OAuth（Supabase）外全走 Socket.IO；服务端仅暴露一个自定义 `/health` HTTP 端点（D10），不引入 REST 层、不用 `@nestjs/terminus`。
- 时间只在 server（根 AGENTS.md 架构铁律 1）：超时代提交、deadline 计算是 server 独有职责。

## 代码约定

- 目录：`src/config`（环境变量/常量）、`src/health`（自定义健康检查）、`src/core`（GameService，纯薄封装 `@new-mj/core` 引擎函数，不加业务逻辑）、`src/rooms`（RoomService/房间状态机/EventBus）、`src/gateway`（RoomsGateway/鉴权中间件/ConnectionRegistry）、`src/persistence`（阶段 5，Prisma 落地，见下）。
- 日志统一用 Nest 内置 `Logger`（每个 `Injectable` 用 `new Logger(XxxService.name)`），不引入 pino/winston 等第三方日志库。
- 数据库/ORM：Prisma + Supabase Postgres（阶段 5，`decisions.md` D22）。房间的实时状态仍然只在内存 `Map`/数组里（重启即丢，架构未变）；`PersistenceService` 只做归档/兜底读取这一件事，`DATABASE_URL` 未配置时每个方法短路成 no-op/`null`，不强制要求一个可用的 Postgres 才能跑起来。
- 测试文件位置/命名遵循根 AGENTS.md 全局约定（`docs/testing-strategy.md` §1.1），server 专属偏离是单元测试后缀用 `*.spec.ts`（NestJS 官方 Jest 生态）；e2e 用 `socket.io-client` 模拟客户端（真实起 `NestFactory` app + 真实 socket 连接，不 mock 传输层）。
- `apps/server` 是本仓库唯一的 CommonJS 包（其余全 ESM，D13），用 Nest 官方默认的 `nest build`/`nest start`，不引入自定义 ESM 编译方案；相对导入按 Nest/CJS 惯例正常写（不需要 `.ts` 后缀）。`nest-cli.json` 的 `deleteOutDir: true` 与 `tsconfig` 的 `incremental: true` 组合过——会因为 `.tsbuildinfo` 缓存没跟着 `dist/` 一起清而静默产出空目录，本仓库因此不开 `incremental`。
- 鉴权用 Socket.IO 握手中间件（`server.use()`，`gateway/auth.middleware.ts`），不是 Nest 的 `CanActivate` 守卫——守卫只保护单条消息，握手阶段不经过它（D14）。
- 座位↔socket 的映射由 `gateway/connection-registry.ts` 维护，不进 `RoomService`/`Room` 类型（D14）；房间内广播用 Socket.IO 原生房间功能，只有 `game:snapshot`/`game:event` 按座位单播才查这张表。
- 端口只有一个来源：`main.ts` 从 `ConfigService.port` 读（该 getter 读 `process.env.PORT`），不要在别处再读一次 `process.env.PORT`。`RoomsGateway` 的 `@WebSocketGateway` 配了 `cors: { origin: true }`（web/mobile 跑在不同端口，天然跨 origin；非商用项目不涉及 cookie/凭据，反射请求来源即可，不需要更复杂的白名单）。
- 所有 WS ack 失败码必须来自 `docs/contracts/protocol-shared.md` §5 的 `ErrCode` 枚举，不得发明新码；core 返回的 `RuleViolation` code 透传在 `message` 字段。
- 可见性过滤一律用 `@new-mj/core` 导出的 `eventsVisibleTo()`，server 不自行判断规则可见性。

## 代码地图

- `src/main.ts`：启动入口（`reflect-metadata` 由 `@nestjs/core` 内部引入，不需要手动 import）。
- `src/app.module.ts`：根 DI 容器。
- `src/config/`：`ConfigModule`/`ConfigService`，`protocolVersion`/`jwtSecret` 等环境变量，以及阶段 5 新增的 `supabaseUrl`/`supabaseServiceKey`（未配置时 `undefined`，不给假默认值——鉴权这块假默认值等于开后门）。
- `src/health/`：自定义 `/health` controller。
- `src/core/`：`GameService`，薄封装 `createGame`/`applyAction`/`getLegalActions`/`getPlayerView`/`computeNextDealer`（engine-api 四签名 + `computeNextDealer` 扩展点）以及 `getOmniscientView`（D19，调试专用）/`rebuildPlayerView`（D20，replay 用）。
- `src/rooms/`：`RoomService`（房间生命周期与编排，含 `getReplay`/`getReplayOmniscientView` 等 replay 查询方法，两者都是 `async`——内存里找不到时会 DB 兜底，见 `contracts/session-mechanics.md` §11）、`room.ts`（内部状态类型，`Room.finishedGames: FinishedGameLog[]` 是每局归档的事件日志+终局状态快照，见同文档 §10）、`room.events.ts`/`event-bus.ts`（类型化 EventBus）、`room-service.error.ts`（携带 `ErrCode` 的异常）。
- `src/gateway/`：`RoomsGateway`（消息路由 + EventBus 订阅；`reply()`/`replyAsync()` 两个 helper，后者只给 `replay:get`/`debug:replayOmniscientView` 这两个可能碰 DB 的 handler 用）、`auth.middleware.ts`（握手鉴权，阶段 5 起按 `supabaseUrl`/`supabaseServiceKey` 是否配置分支真实 Supabase 校验 vs D16 开发态校验）、`connection-registry.ts`（座位↔socket 映射）、`gateway.module.ts`。
- `src/persistence/`（阶段 5）：`prisma.service.ts`（`PrismaClient` 的 Nest 生命周期封装，用 `@prisma/adapter-pg` driver adapter 连接，见 Prisma 7 的 `datasource.url` 移除说明，`decisions.md` D22）、`persistence.service.ts`（`archiveGame`/`archiveSession`/`findGame`/`findSession`/`upsertProfile`/`findProfile`，`DATABASE_URL` 未设置时全部短路成 no-op/`null`）、`persistence.module.ts`。`prisma/schema.prisma`/`prisma/migrations/` 在 `apps/server` 目录顶层（不在 `src/` 下，Prisma 惯例），`prisma.config.ts` 是 Migrate CLI 专用配置（不参与 `tsc` 编译）。

## apps/server DoD

- `pnpm --filter @new-mj/server verify` 全绿。
- 阶段验收（`docs/process/workflow.md`）：`socket.io-client` 模拟 4 客户端整局跑通。
- 新增/修改 WS 消息同步 `docs/contracts/protocol-shared.md`；房间状态机变更同步 `docs/contracts/session-mechanics.md`（与代码同一 commit）。
