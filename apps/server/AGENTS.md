# apps/server AGENTS.md

本文件只约束 `apps/server`；根目录 `AGENTS.md` 的全局规则同样适用。

## package 职责

- server 是 core engine 与客户端之间的编排/传输中介：房间生命周期、Socket.IO 网关、鉴权、按可见性分发事件。
- 禁止在 server 里实现任何玩法规则（D12 铁律）；server 只把 `config.rulesetId` 当不透明字符串传给 core，不做规则分支判断。
- 除 OAuth（Supabase）外全走 Socket.IO；服务端仅暴露一个自定义 `/health` HTTP 端点（D10），不引入 REST 层、不用 `@nestjs/terminus`。
- 时间只在 server（根 AGENTS.md 架构铁律 1）：超时代提交、deadline 计算是 server 独有职责。

## 代码约定

- 目录：`src/config`（环境变量/常量）、`src/health`（自定义健康检查）、`src/core`（GameService，纯薄封装 `@new-mj/core` 四个引擎函数，不加业务逻辑）、`src/rooms`（RoomService/房间状态机/EventBus）、`src/gateway`（RoomsGateway/AuthGuard）。
- 日志统一用 Nest 内置 `Logger`（每个 `Injectable` 用 `new Logger(XxxService.name)`），不引入 pino/winston 等第三方日志库。
- 数据库/ORM 占位：phase 4 落地时用 Prisma + Supabase Postgres；phase 2 不接入任何持久化代码，房间状态用内存 `Map`，重启即丢。
- 测试遵循 NestJS 官方 Jest 生态：单元测试 `*.spec.ts` 与源码同目录；集成/E2E 放 `test/*.e2e-spec.ts`，用 `socket.io-client` 模拟客户端。
- `apps/server` 是本仓库唯一的 CommonJS 包（其余全 ESM），用 Nest 官方默认的 `nest build`/`nest start`，不引入自定义 ESM 编译方案；相对导入按 Nest/CJS 惯例正常写（不需要 `.ts` 后缀）。
- 所有 WS ack 失败码必须来自 `docs/protocol.md` §4 的 `ErrCode` 枚举，不得发明新码；core 返回的 `RuleViolation` code 透传在 `message` 字段。
- 可见性过滤一律用 `@new-mj/core` 导出的 `eventsVisibleTo()`，server 不自行判断规则可见性。

## 代码地图

- `src/main.ts`：启动入口（`reflect-metadata` 由 `@nestjs/core` 内部引入，不需要手动 import）。
- `src/app.module.ts`：根 DI 容器。
- `src/config/`：`ConfigModule`/`ConfigService`，环境变量与 `PROTOCOL_VERSION` 常量。
- `src/health/`：自定义 `/health` controller。
- `src/core/`：`GameService`，薄封装 `createGame`/`applyAction`/`getLegalActions`/`getPlayerView`。
- `src/rooms/`：`RoomService`、房间状态机类型、`EventBus`。
- `src/gateway/`：`RoomsGateway`、`AuthGuard`、Socket.IO 消息路由。

## apps/server DoD

- `pnpm --filter @new-mj/server verify` 全绿。
- 阶段验收（`docs/workflow.md`）：`socket.io-client` 模拟 4 客户端整局跑通。
- 新增/修改 WS 消息同步 `docs/protocol.md`；房间状态机变更同步 `docs/rooms.md`（与代码同一 commit）。
