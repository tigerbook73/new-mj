# 阶段 2：NestJS Server 架构与实施计划

> **状态**：设计完成，待执行
> **范围**：房间管理 + Socket.IO 集成 + MVP 4-round 会话
> **总工期**：~7-10 天单人；~4-5 天并行（本版不再宣称脚手架/文档可并行，见「章节调整说明」）

## Context

**为什么做**：阶段 1.5 core 规则引擎完成，现在需要 server 来编排多局会话、管理房间、通过 Socket.IO 与客户端通信。

**已有基础**：

- ✅ core engine 纯函数完成（junk + bloodbattle），对外四签名见 `packages/core/src/engine.ts`
- ✅ `docs/protocol.md`、`docs/rooms.md` 契约文档已定稿（本文档所有接口设计以它们为准）
- ✅ `packages/core` 已用 tsup 双发 CJS+ESM（`exports.require` → `dist/index.cjs`，`exports.import` → `dist/index.js`），可直接被 CJS 或 ESM 消费方引用，见 `packages/core/tsup.config.ts`

**待办 / 遗留问题**（本版更新，反映仓库当前真实状态）：

- ❌ `apps/server` 当前有一批**未提交的 WIP 文件**（`app.module.ts`、`config/`、`core/game.service.ts`、`main.ts`、`vitest.config.ts` 及对 `package.json`/`tsconfig.json` 的未提交修改）。这批 WIP 未经过本次设计评审，与本文档的技术决策存在偏差（例如误用 ESM + vitest，而本版明确改回 Nest 官方默认的 CommonJS + Jest；`createGame` 调用签名与 core 真实 API 不符）。**执行步骤 1 时全部丢弃、不参考。**
- ❌ `packages/protocol/src/` 目前只有占位 `index.ts`（`export const packageName = "@new-mj/protocol" as const;`），**没有** `schemas.ts`、没有 zod 依赖、没有 `RoomInfo`/`RoomCreateRequest` 等任何类型定义，也没有 tsup 构建步骤。这些是步骤 4 的交付物之一，不是可以直接引用的既有资源。
- ❌ 依赖配置不完整（缺 zod、`@nestjs/*`、`tsup`(protocol) 等，步骤 1/4 分别补齐）

**关于 `apps/server` 使用 CommonJS 的说明**：本仓库其余部分（根、`apps/web`、`apps/mobile`）均为 ESM（`"type": "module"`）。`apps/server` 是**唯一的例外**，本版明确选择 **CommonJS + Nest 官方默认构建/运行方式**（`nest build`/`nest start`），理由：

1. NestJS 框架本身官方立场是 CJS-first，短期不打算迁移 ESM（[nestjs/nest#13319](https://github.com/nestjs/nest/issues/13319)，作者原话："CJS was the standard way of doing modules for +10 years and it's not going anywhere"）；跟着官方默认路径走，踩坑最少、无需自定义 tsconfig 拆分或手写 dev 脚本。
2. `packages/core` 已双发 CJS/ESM，`packages/protocol`（步骤 4 新建时）同样双发（见下）——CJS 的 `apps/server` 能通过 `exports.require` 正常消费两者，不存在跨包摩擦。
3. `apps/web`/`apps/mobile` 不受影响，继续通过 `exports.import` 消费 ESM 侧。

---

## 推荐方案：6 步骤严格串行实施

### 总体架构

```
Client (Socket.IO)
  ↓
RoomsGateway (WebSocketGateway + handlers)
  ├─ AuthGuard (JWT decode → socket.data.userId)
  ├─ Message routing (room:create, room:join, game:action, ...)
  └─ Event broadcasting (game:event, room:scoreUpdated, ...)
  ↓
RoomService (核心编排)
  ├─ 房间生命周期 (create, join, ready, start)
  ├─ GameSession 包装
  ├─ 分数累加
  └─ 庄家轮转 + 会话终止判定
  ↓
GameService (纯函数包装)
  ├─ createGame → core engine
  ├─ applyAction → core engine
  ├─ getPlayerView → core engine
  └─ getLegalActions → core engine
  ↓
@new-mj/core (引擎层)
```

**事件流示意**（`game:snapshot` 为单播，见 `docs/protocol.md` §3；不再使用未登记的 `game:started`/`room:phaseChanged`，见「开放问题」）：

```
Client: room:join {roomId} ack request
  ↓
Server: RoomsGateway.handleJoin() → RoomService.join()
  ├─ ack: {ok: true, data: RoomInfo 快照}
  └─ broadcast: room:playerJoined {seat, nickname} → 房间内所有人（含本人）

Client: game:action {discard 5m} ack request
  ↓
Server: RoomsGateway.handleGameAction() → RoomService.applyPlayerAction()
  ├─ delegate to GameService.applyAction(state, seat, action)
  ├─ extract Settled events → accumulateScores()
  ├─ ack: {ok: true}
  └─ broadcast: game:event {event, deadline?} → 按座位可见性过滤，单连接分发

Game ends:
  ↓
Server: RoomService.handleGameEnd() → nextRound() or finish()
  ├─ emit room:scoreUpdated {scores, gameNumber, totalGames?}
  ├─ emit room:dealerChanged {dealer, gameNumber}
  └─ 对每个座位单独 emit game:snapshot {view, seq, deadline?} → 新一局开始
```

---

## 6 步骤分解

### 步骤 1+2：Nest CLI 脚手架 + 对齐 monorepo 工程约定（1-2 天）

**目标**：用 NestJS 官方 CLI 生成脚手架，走 **Nest 默认的 CommonJS + `nest build`/`nest start`**（不引入自定义 ESM 编译方案），再补齐本仓库 pnpm/turbo 约定。这两件事落地必须是**同一批可过 typecheck 的 commit**（`docs/workflow.md`："main 始终全绿，DoD 1-3 过才提交"）。

#### 1a. 生成方式：隔离生成（评审点，见下方理由）

`apps/server` 目录不是空目录（有提交历史、当前有未提交 WIP），直接在原地跑 `nest new` 有交互式覆盖确认、且一旦漏传 flag 会直接污染工作区。改用**隔离生成**：

```bash
# 在仓库外的临时目录生成，不污染工作区
cd /tmp && pnpm dlx @nestjs/cli@latest new server-scaffold \
  --skip-git --skip-install --package-manager pnpm

# 搬运整套标准产物（本版采用 Nest 默认构建方式，nest-cli.json/tsconfig.build.json 都保留）
cp /tmp/server-scaffold/src/main.ts          apps/server/src/main.ts
cp /tmp/server-scaffold/src/app.module.ts    apps/server/src/app.module.ts
cp /tmp/server-scaffold/nest-cli.json        apps/server/nest-cli.json
cp /tmp/server-scaffold/tsconfig.build.json  apps/server/tsconfig.build.json
rm -rf /tmp/server-scaffold
```

**丢弃**：Nest 默认生成的 `app.controller.ts`/`app.service.ts`/`app.controller.spec.ts`（HTTP "Hello World" 模板，与 D10「服务端仅 /health」的定位不符）、`.git`、`.eslintrc.js`（本仓库统一用根 `eslint.config.mjs`）。

**保留**：`nest-cli.json`（本版使用 Nest 自带的 `tsc` builder，`nest build`/`nest start` 需要它；后续若用 `nest generate` 继续脚手架化也依赖它存在）。

**丢弃**：`apps/server` 现有未提交 WIP 全部文件——不参考、不合并。

**评审点（隔离 vs 原地生成）**：推荐隔离生成，代价是多一步文件搬运；换来的是即使某个 flag 传漏，副作用只发生在临时目录，且"哪些文件是 CLI 产物、哪些是手写"从生成方式上天然清楚。

`@nestjs/cli` 不进任何 `package.json`，每次用 `pnpm dlx` 现取现用；后续新增依赖一律用根目录 `pnpm add <pkg> --filter @new-mj/server`，不在 `apps/server` 目录下直接跑 `npm install`/`pnpm install`（会产生独立 lockfile，破坏单一 `pnpm-lock.yaml`）。

#### 1b. CommonJS + Nest 默认构建方案

`apps/server` 是本仓库唯一的 CJS 包（其余全 ESM，见 Context「关于 apps/server 使用 CommonJS 的说明」）。**直接用 `nest build`/`nest start`**，不做任何自定义 tsconfig 拆分或编译期路径重写。原因见官方原话（[docs.nestjs.com/cli/scripts](https://docs.nestjs.com/cli/scripts)）：

> "`nest build` is a wrapper on top of the standard `tsc` compiler... It does not add any other compilation features or steps except for handling `tsconfig-paths` out of the box."
> "`nest start` simply ensures the project has been built (same as `nest build`), then invokes the `node` command..."

也就是说 `nest build`/`nest start` 本质就是"tsc 编译 + node 启动"的官方封装，没有隐藏的额外构建语义，直接用即可，不需要重新发明。

`apps/server/tsconfig.json`（继承仓库基线；`tsconfig.base.json` 本来就是 `module`/`moduleResolution: NodeNext`，**不需要覆盖成 `commonjs`/`node`**——`apps/server/package.json` 不设置 `"type"` 字段，NodeNext 解析在缺省 `"type"` 下天然按 CJS 语义处理该包的所有文件，与 Nest CLI 最新版脚手架的默认产出一致；保留 strict 系列选项以满足 `docs/workflow.md`「`pnpm typecheck` 全仓 tsc strict」的 DoD）：

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node", "jest"],
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
}
```

（`types` 需要显式加 `"jest"`：`tsconfig.base.json` 把 `types` 锁定为 `["node"]`，不加会导致 `describe`/`it`/`expect` 报"找不到名称"。不设置 `baseUrl`/`incremental`：`baseUrl` 在 TS 6 已弃用且这里用不到路径别名；`incremental` 曾在实测中踩坑——见下方「实测踩坑」。）

`apps/server/tsconfig.build.json`（在 `tsconfig.json` 基础上打开 emit、关闭继承来的 `allowImportingTsExtensions`——CJS 不需要 `.ts` 导入后缀改写，且该选项要求 `noEmit`/`emitDeclarationOnly`/`rewriteRelativeImportExtensions` 三者之一为真，`noEmit: false` 后必须关掉它，排除测试文件参与构建产物）：

```jsonc
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "allowImportingTsExtensions": false,
  },
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts"],
}
```

`apps/server/nest-cli.json`（Nest CLI 生成的默认内容，显式写出 `tsConfigPath` 便于对照）：

```jsonc
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "tsConfigPath": "tsconfig.build.json",
  },
}
```

`main.ts` 首行不需要手动 `import "reflect-metadata"`——`@nestjs/core` 自己在内部引入了 `reflect-metadata` 作为副作用，Nest 11 的默认脚手架 `main.ts` 里也没有这行，照抄即可。

**实测踩坑（`nest-cli.json` 的 `deleteOutDir: true` + tsconfig 的 `incremental: true` 不兼容）**：`deleteOutDir` 会在每次 `nest build` 前清空 `dist/`，但 `incremental: true` 产生的 `.tsbuildinfo` 缓存文件默认落在项目根目录（不在 `dist/` 内），不会被一起清掉。下一次 `nest build` 时 tsc 读到这份"过期但看似有效"的缓存，误判"源码没变化"直接跳过发出文件——`dist/` 被清空后就再也没有重新生成，命令却以退出码 0 报"成功"。本版**不设置 `incremental`**，避免这类静默失败；这个仓库的 DoD 要求每次 `pnpm verify` 可干净复现，省下的编译时间不值得承担这个风险。

`package.json` 不设置 `"type"` 字段（缺省即 CommonJS，与根/`apps/web`/`apps/mobile` 的 `"type": "module"` 不同——每个 workspace package 的 `package.json#type` 是独立生效的，不会互相冲突）。**删除**当前 WIP 里把 `AppModule`/`ConfigService`/`GameService` 等 re-export 的 `src/index.ts`——`apps/server` 是可执行 app，仓库里没有任何 package 消费 `@new-mj/server`，不需要伪装成库，`main.ts` 就是唯一入口。

#### 1c. 测试改回 Jest（标准 Nest 配置，无需 ESM 特殊处理）

`docs/workflow.md`明确要求"`apps/server` 使用 NestJS 时采用 Jest，遵循 NestJS 官方测试生态"。当前 WIP 用了 `vitest.config.ts`，是对 workflow.md 的偏离，本步骤改回。因为走 CJS，不需要 `useESM`/`extensionsToTreatAsEsm`/`NODE_OPTIONS=--experimental-vm-modules` 这些 ESM 专属配置，直接用 Nest CLI 生成的标准 Jest 配置：

```json
// apps/server/package.json 内嵌 "jest" 字段（Nest CLI 默认生成方式）
{
  "jest": {
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

E2E/集成测试单独放 `test/jest-e2e.json` 配置 + `test/*.e2e-spec.ts`（Nest 官方约定，`test/rooms.e2e-spec.ts` 承载步骤 6 的"4 客户端整局"验收）。

- `ts-jest` 走 TypeScript compiler API，正确处理 `emitDecoratorMetadata`，与 `nest build` 内部用 tsc 保持同一套装饰器元数据语义。
- 确认 `turbo.json` 的 `test` task 是空任务定义（不绑定具体 runner），**本次改动无需修改 `turbo.json`**。

#### 1d. package.json 脚本

```jsonc
{
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "dev": "nest start --watch",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src",
    "test": "jest --passWithNoTests",
    "test:e2e": "jest --config ./test/jest-e2e.json --passWithNoTests",
    "verify": "pnpm typecheck && pnpm lint && pnpm test",
  },
}
```

`dev` 直接用 `nest start --watch`（内部走 `tsc --watch` 增量编译 + 自动重启，官方维护，不需要自己拼 `tsc --watch & node --watch`）。`test`/`test:e2e` 本步骤先加 `--passWithNoTests`——步骤 1+2 只有一个冒烟测试（见下），真正的业务单元测试/E2E 要到步骤 4/6 才大量出现，避免"没测试就报红"卡住这一步的 commit。

**新增依赖**（本步骤只装脚手架实际用到的最小集合；`class-validator`/`class-transformer`/`zod` 留给步骤 4，`@nestjs/websockets`/`@nestjs/platform-socket.io`/`socket.io` 留给步骤 5，用到时再加，不提前引入未使用的包）：

```json
{
  "dependencies": {
    "@nestjs/common": "^11",
    "@nestjs/core": "^11",
    "@nestjs/platform-express": "^11",
    "@new-mj/core": "workspace:*",
    "@new-mj/protocol": "workspace:*",
    "reflect-metadata": "^0.2",
    "rxjs": "^7"
  },
  "devDependencies": {
    "@nestjs/cli": "^11",
    "@nestjs/testing": "^11",
    "jest": "^30",
    "ts-jest": "^29",
    "@types/jest": "^30"
  }
}
```

`@new-mj/protocol` 现在就声明为依赖（供步骤 4 使用），但本步骤代码里不实际 `import` 它——`packages/protocol` 要到步骤 4 才补 tsup 双发（见下），在那之前 CJS 的 `apps/server` 还不能安全 `require()` 它的 ESM 源码导出。`@new-mj/ai` 暂不引入——AI 玩家管理是评审点 H 的后续工作，本阶段不涉及。`@nestjs/cli` 这次作为常规 devDependency 保留（区别于步骤 1a 用 `pnpm dlx` 一次性生成脚手架——那是初始化动作；装好之后日常的 `nest generate` 走本地依赖，不必每次都 `dlx`）。

（依赖版本按 `docs/workflow.md`「新增或刷新依赖时优先使用最新稳定版」执行时以实际可用版本为准；上面版本号是本次实施时 `pnpm add` 解析到的实际最新稳定版，Nest 11 是本文档撰写时的最新大版本。）

**冒烟测试**（`apps/server/src/app.module.spec.ts`，验证 DI 图能编译，不是"没有测试也算过"）：

```ts
import { Test } from "@nestjs/testing";
import { AppModule } from "./app.module";

describe("AppModule", () => {
  it("compiles the DI graph", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
```

**最小 commit**：

1. `chore(server): regenerate scaffold via nest CLI (CommonJS), align to pnpm/turbo`

**测试方式**：

- `pnpm --filter @new-mj/server typecheck` 无错误
- `pnpm --filter @new-mj/server build` 产出 `dist/main.js`，`node dist/main.js` 能启动（即使无 gateway）

---

### 步骤 3：`apps/server/AGENTS.md` + `CLAUDE.md`（0.5 天）

**目标**：仿照 `packages/core/AGENTS.md`（现存唯一的 package 级样例，5 段结构）为 `apps/server` 建立同构的规范文档。本步骤依赖步骤 1+2 敲定的工具链结论（Jest、tsc 编译方案），因此**不能与步骤 1+2 并行**（见「章节调整说明」）。

**创建文件**：

- `apps/server/CLAUDE.md`：

  ```markdown
  # CLAUDE.md

  @AGENTS.md
  ```

- `apps/server/AGENTS.md`：

  ```markdown
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

  - `src/main.ts`：启动入口，`reflect-metadata` 必须是第一行 import。
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
  ```

**最小 commit**：

1. `docs(server): add CLAUDE.md + AGENTS.md`

---

### 步骤 4：核心服务（1-2 天）

**目标**：实现 `RoomService`、`GameSession`、`EventBus`，房间编排逻辑完整，接口签名与 core 真实 API / `docs/rooms.md` 契约对齐。

**创建/修改文件**：

1. **`apps/server/src/core/game.service.ts`**：

   ```ts
   @Injectable()
   class GameService {
     createGame(config: GameConfig, seed: number): ApplyResult<unknown>;
     applyAction(state: unknown, seat: SeatId, action: unknown): ApplyResult<unknown>;
     getPlayerView(state: unknown, seat: SeatId): PlayerViewBase | undefined;
     getLegalActions(state: unknown, seat: SeatId): readonly unknown[];
   }
   ```

   与 `packages/core/src/engine.ts:31-32` 的真实签名一致：`rulesetId` 已内含在 `GameConfig` 里，不作为独立参数；`seed` 为必填；`getPlayerView` 显式允许 `undefined`。

2. **`apps/server/src/health/health.controller.ts`**（新增，D10「服务端仅 /health」）：

   ```ts
   @Controller("health")
   class HealthController {
     @Get()
     check() {
       return { ok: true, uptime: process.uptime() };
     }
   }
   ```

3. **`apps/server/src/rooms/room.service.ts`**（方法名对齐 `docs/rooms.md` §7.1，不再沿用旧版自造命名）：

   ```ts
   @Injectable()
   class RoomService {
     create(rulesetId: string, config: GameConfig): Room;
     join(roomId: string, userId: string): Player;
     ready(roomId: string, userId: string, ready: boolean): void;
     start(roomId: string): void;
     nextRound(roomId: string): void;

     // 辅助计算
     accumulateScores(room: Room, scoreDeltas: [number, number, number, number]): void;
     computeNextDealer(sessionFormat: SessionFormat, currentDealer: SeatId): SeatId;
     shouldContinue(room: Room): boolean;
     computeRanking(room: Room): RankingEntry[];

     // 工具
     snapshot(room: Room): RoomInfo;
     get(roomId: string): Room | null;
   }
   ```

   `start`/`nextRound` 内部自行生成随机 seed（存入 `room` 状态便于调试/复现），连同 `room.config` 一起传给 `GameService.createGame(config, seed)`。

   `sessionFormat` 默认值为 `'4-round'`（`SessionFormat = "4-round" | "best-of-3"`，无 `'default'` 取值）。

4. **`apps/server/src/rooms/room.events.ts`**（新增）：

   ```ts
   interface PlayerJoinedPayload {
     seat: SeatId;
     nickname: string;
     isBot: boolean;
   }
   interface ScoreUpdatedPayload {
     scores: [number, number, number, number];
     gameNumber: number;
     totalGames?: number;
   }
   interface DealerChangedPayload {
     dealer: SeatId;
     gameNumber: number;
   }
   interface SessionFinishedPayload {
     result: SessionResult;
   }
   ```

5. **`apps/server/src/rooms/event-bus.ts`**（新增）：

   ```ts
   @Injectable()
   class EventBus extends EventEmitter {
     // 简单包装 Node.js EventEmitter；MVP 用本地 emitter，phase 4 可换成 Redis 或 Bull
   }
   ```

6. **`apps/server/src/rooms/rooms.module.ts`**（新增）：

   ```ts
   @Module({
     imports: [CoreModule],
     providers: [RoomService, EventBus],
     exports: [RoomService, EventBus],
   })
   class RoomsModule {}
   ```

**关键逻辑**（提取分数、终止判定沿用旧版设计，签名已更新）：

```ts
private extractScoreDeltas(events: GameEvent[]): [number, number, number, number] {
  const deltas: [number, number, number, number] = [0, 0, 0, 0];
  events.forEach((e) => {
    if (e.payload?.type === "Settled") {
      e.payload.scoreDeltas.forEach((delta, i) => (deltas[i] += delta));
    }
  });
  return deltas;
}
```

7. **`packages/protocol/src/schemas.ts`**（新增，当前 `packages/protocol` 只有占位 `index.ts`，这是本步骤的交付物，不是可直接引用的既有资源）：用 zod 定义 `RoomInfo`/`RoomCreateRequest`/`RoomJoinRequest`/`RoomReadyRequest`/`GameActionRequest` 等类型，供 server 及未来 web/mobile 共享。同一 commit 补充 `zod` 依赖。

8. **`packages/protocol` 补 tsup 双发构建**（照抄 `packages/core` 的现有做法，见 `packages/core/tsup.config.ts`）：

   ```ts
   // packages/protocol/tsup.config.ts
   import { defineConfig } from "tsup";

   export default defineConfig({
     clean: true,
     dts: true,
     entry: ["src/index.ts"],
     format: ["esm", "cjs"],
     outDir: "dist",
     platform: "neutral",
     sourcemap: true,
     splitting: false,
     target: "es2022",
   });
   ```

   `package.json` 同步调整为双发 `exports`（与 `packages/core` 现有写法一致）并新增 `build` 脚本：

   ```jsonc
   {
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "import": "./dist/index.js",
         "require": "./dist/index.cjs",
       },
     },
     "scripts": {
       "build": "tsup --config tsup.config.ts",
       "typecheck": "tsc -p tsconfig.json",
       "lint": "eslint src",
       "test": "vitest run",
       "verify": "pnpm typecheck && pnpm lint && pnpm test",
     },
   }
   ```

   这一步是本版新决定的关键前提：正因为 `packages/protocol` 双发 CJS/ESM，CJS 的 `apps/server`（步骤 1+2）才能直接 `require()` 它，不需要 `apps/server` 迁就 ESM。`turbo.json` 的 `build` task 已有 `dependsOn: ["^build"]`，`packages/protocol` 加上 `build` 脚本后会被自动纳入依赖构建链，不需要改 `turbo.json`。

**复杂度**：中等（状态机 + 事件编排）

**最小 commit**：

1. `feat(server): add ConfigService + health endpoint`
2. `feat(server): add GameService wrapper`
3. `feat(server): implement RoomService orchestration + EventBus`
4. `chore(protocol): add tsup dual CJS/ESM build`
5. `feat(protocol): add zod schemas for room/game contracts`

（如实现中发现契约缺口需要修订 `protocol.md`/`rooms.md`，同批追加 `docs(protocol|rooms): ...` commit，`docs/` 变更与对应代码同一 commit。）

**测试方式**：

- 单元测试（Jest，`*.spec.ts` 与源码同目录）：`RoomService` 每个公共方法（房间创建 + 加入 + 就绪检查、分数累加逻辑、庄家轮转、`shouldContinue` 判定）
- 不涉及 Socket.IO（步骤 6 集成测试时测）

---

### 步骤 5：Socket.IO Gateway（2-3 天）

**目标**：WebSocket 入口，消息路由，可见性过滤，错误处理。

**创建文件**：

1. **`apps/server/src/gateway/rooms.gateway.ts`**：

   ```ts
   @WebSocketGateway({ namespace: "/", transports: ["websocket"] })
   class RoomsGateway {
     @SubscribeMessage("room:create")
     async handleRoomCreate(client: Socket, payload: RoomCreateRequest) {}

     @SubscribeMessage("room:join")
     async handleRoomJoin(client: Socket, payload: RoomJoinRequest) {}

     @SubscribeMessage("room:ready")
     async handleRoomReady(client: Socket, payload: RoomReadyRequest) {}

     @SubscribeMessage("room:start")
     async handleRoomStart(client: Socket, payload: {}) {}

     @SubscribeMessage("game:action")
     async handleGameAction(client: Socket, payload: GameActionRequest) {}

     handleConnection(client: Socket) {}
     handleDisconnect(client: Socket) {}
   }
   ```

2. **`apps/server/src/gateway/auth.guard.ts`**：

   ```ts
   @Injectable()
   class AuthGuard implements CanActivate {
     canActivate(context: ExecutionContext): boolean {
       const client = context.switchToWs().getClient<Socket>();
       const payload = this.jwtService.verify(client.handshake.auth.token);
       client.data.userId = payload.sub;
       return true;
     }
   }
   ```

3. **`apps/server/src/gateway/gateway.module.ts`**：

   ```ts
   @Module({
     imports: [RoomsModule, AuthModule],
     providers: [RoomsGateway],
   })
   class GatewayModule {}
   ```

**`game:snapshot` 单播广播**（修正：`docs/protocol.md` §3 定义为单播 `{ view, seq, deadline? }`，不是群发）：

```ts
private broadcastSnapshots(room: Room): void {
  room.players.forEach((player, seatId) => {
    if (!player?.socketId) return;
    const view = this.gameService.getPlayerView(room.gameState, seatId as SeatId);
    if (!view) return;
    this.server.to(player.socketId).emit("game:snapshot", {
      view,
      seq: room.seq,
      deadline: undefined,
    });
  });
}
```

**可见性过滤**（`game:event` 按座位单连接推送）：

```ts
private broadcastGameEvent(roomId: string, event: GameEvent): void {
  const room = this.roomService.get(roomId);
  if (!room) return;
  room.players.forEach((player, seatId) => {
    if (!player?.socketId) return;
    const visible = eventsVisibleTo([event], seatId as SeatId).length > 0;
    if (!visible) return;
    this.server.to(player.socketId).emit("game:event", { event });
  });
}
```

**错误码**（照抄 `docs/protocol.md` §4 真实枚举，不再编造码）：

```ts
const ERROR_CODES = [
  "UNAUTHORIZED",
  "VERSION_MISMATCH",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ALREADY_IN_ROOM",
  "NOT_IN_ROOM",
  "GAME_IN_PROGRESS",
  "NOT_YOUR_TURN",
  "ILLEGAL_ACTION",
  "INVALID_CONFIG",
  "INTERNAL",
] as const;
```

若"对局未开始时收到 `game:action`"确有必要单独区分，属于本步骤实现时的开放问题——见下方「开放问题」，不得复用语义相反的 `GAME_IN_PROGRESS`。

**复杂度**：中-高（NestJS + Socket.IO 模式，可见性过滤）

**最小 commit**：

1. `feat(server): add RoomsGateway with room lifecycle handlers`
2. `feat(server): implement game:action handler + per-seat snapshot broadcast`
3. `feat(server): add AuthGuard`

**测试方式**：

- 单元测试：`AuthGuard`、错误处理
- 集成测试（`socket.io-client` 模拟客户端）：`room:create` → ack + broadcast `room:playerJoined`；`room:join` × 3 → 房间满；`room:ready` × 4 → 触发 `start`；`game:action` → ack + `game:event`（按座位单连接过滤）

---

### 步骤 6：集成与 E2E 测试（1-2 天）

**目标**：端到端验证 4 人游戏完整流程（创建 → 开始 → 1 局完成 → 排名）。

**创建文件**：

1. **`apps/server/test/rooms.e2e-spec.ts`**：4 个 `socket.io-client` 模拟客户端跑通 create → join×4 → ready×4 → start → 1 局 → finished → 排名。
2. **`apps/server/src/rooms/room.service.spec.ts`**：分数累加、庄家轮转、`shouldContinue` 判定。
3. **`apps/server/src/core/game.service.spec.ts`**：包装 `createGame`/`applyAction` 委托 core 正确。
4. **`apps/server/test/fixtures/mock-actions.ts`**：预定义的合理动作序列（用于 E2E）。

**DoD（验收标准）**：

- [ ] 4 玩家创建房间 → 加入 → 就绪 → 开始
- [ ] Core engine 驱动完整 1 局游戏
- [ ] 分数正确累加
- [ ] 房间状态转移（waiting → in-game → finished）
- [ ] 最终排名计算正确
- [ ] 所有错误码匹配 `docs/protocol.md` §4
- [ ] `pnpm --filter @new-mj/server verify` 全绿
- [ ] 手工测试：4 个 `socket.io-client` 模拟客户端完整流程

**最小 commit**：

1. `test(server): add 4-player E2E via socket.io-client`
2. `test(server): add RoomService/GameService unit specs`

达标后打 tag `phase-2`（`docs/workflow.md`：阶段验收 = 可运行产物跑通 + doc-map §4 吸纳仪式完成）。

---

## 章节调整说明

本版相对旧版做了以下结构调整：

- **不再宣称"脚手架与文档可并行"**：新的步骤 3（AGENTS.md）要写的内容（测试=Jest、日志=Nest Logger、Prisma+Supabase 占位）本质上是步骤 1+2 敲定的工具链结论的书面化，先写步骤 3 等于凭空猜步骤 1+2 的产出，因此本版**严格串行**。
- 用"步骤"取代"阶段"编号，避免与 `docs/plan.md` 外层"阶段 2"编号重叠；内部步骤不单独打 tag，只在步骤 6 完成后打一次 `phase-2`。

---

## 开放问题

以下问题在制定本文档时发现，**不擅自裁决**，标注解决时机：

1. **`room:start` ack 内容与 ack/event 分离原则的矛盾**：`docs/rooms.md` §5.1 把 `room:start` 的 ack data 写成 `{ gameSnapshot }`，但 `docs/protocol.md` §1 明确"命令 = ack 给回执、事件给状态"（发起者不得靠 ack data 更新状态）。步骤 5 实现 `room:start` 时需要与 `docs/rooms.md` 澄清并同一 commit 修订。
2. **未登记的事件名**：`game:started`、`room:phaseChanged` 曾在早期草稿/`docs/rooms.md` §8 时序图中出现，但均未在 `docs/protocol.md` §3 或 `docs/rooms.md` §5.2 的正式事件表登记。本文档统一改用已登记的 `game:snapshot` 表达开局/切局。如实现时确认仍需要专门的阶段切换信号，需先在 `protocol.md`/`rooms.md` 补登记，再实现。
3. **"对局未开始收到 `game:action`"的错误码缺口**：`docs/protocol.md` §4 现有枚举里没有语义贴合的码（`GAME_IN_PROGRESS` 语义相反）。步骤 5 实现时如确认这是真实会发生的场景，需要同一 commit 在 `protocol.md` §4 补码，不得复用 `GAME_IN_PROGRESS`。

---

## 每步骤 commit 清单

| 步骤     | Commit 数 | 消息示例                                                                                                                                                                                                                                                                                                                     |
| -------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1+2      | 1         | `chore(server): regenerate scaffold via nest CLI (CommonJS), align to pnpm/turbo`                                                                                                                                                                                                                                            |
| 3        | 1         | `docs(server): add CLAUDE.md + AGENTS.md`                                                                                                                                                                                                                                                                                    |
| 4        | 5         | `feat(server): add ConfigService + health endpoint` + `feat(server): add GameService wrapper` + `feat(server): implement RoomService orchestration + EventBus` + `chore(protocol): add tsup dual CJS/ESM build` + `feat(protocol): add zod schemas for room/game contracts`（视契约缺口追加 `docs(protocol\|rooms)` commit） |
| 5        | 3         | `feat(server): RoomsGateway` + `feat(server): game:action handler + per-seat snapshot broadcast` + `feat(server): AuthGuard`                                                                                                                                                                                                 |
| 6        | 2         | `test(server): E2E integration` + `test(server): unit tests`                                                                                                                                                                                                                                                                 |
| **总计** | **~12**   | 小、可审阅的提交，达标后打 tag `phase-2`                                                                                                                                                                                                                                                                                     |

---

## 关键文件清单（实施前必读）

1. `docs/protocol.md` — Socket.IO ack/event 规范、错误码 §4、`game:snapshot` 单播语义 §3
2. `docs/rooms.md` — 房间状态机、计分逻辑、`RoomService` 方法命名 §7.1
3. `packages/core/src/engine.ts` — `GameService` 必须对齐的真实四签名
4. `packages/core/AGENTS.md` — `apps/server/AGENTS.md` 复刻的五段结构样例
5. `docs/decisions.md` — D1、D3、D10、D11、D12 决策背景
6. `docs/workflow.md` — DoD、Jest 选型、commit 纪律、阶段验收标准
7. `packages/core/tsup.config.ts` + `packages/core/package.json#exports` — `packages/protocol` 双发构建要照抄的现成样例
8. [nestjs/nest#13319](https://github.com/nestjs/nest/issues/13319) — Nest 官方对 ESM 支持现状的表态，`apps/server` 选 CommonJS 的依据

**待创建**（不是可引用的既有资源）：`packages/protocol/src/schemas.ts` + `packages/protocol/tsup.config.ts`（步骤 4 交付物）

---

## 验收与验证

**最终检查清单**：

- [ ] `pnpm typecheck` 无错误
- [ ] `pnpm lint` 无违规
- [ ] `pnpm test` 全部通过（server 用 Jest，core/protocol/ai 用 Vitest）
- [ ] `socket.io-client` × 4 手工测试完整流程
- [ ] 所有错误码映射到 `docs/protocol.md` §4，无编造码
- [ ] 没有在 server 中实现规则（规则只在 core）
- [ ] 所有 Socket.IO 消息遵循 ack/event 分离原则（含「开放问题」第 1 条的澄清结果）
- [ ] 可见性过滤用 core 的 `eventsVisibleTo()`
- [ ] `game:snapshot` 为单播，非群发

**end-to-end 验证命令**：

```bash
cd apps/server

pnpm build
pnpm test
pnpm verify

# 手工测试（启动 server + 4 个客户端模拟器）
node dist/main.js &
node test/fixtures/manual-4client.js
```

---

## 已知限制与未来扩展

**MVP 不做**（但设计已预留扩展点）：

- ❌ 超时强制 pass（即时决策 OK）
- ❌ AI 玩家管理（评审点 H）
- ❌ 重连/恢复（phase 4）
- ❌ 持久化（phase 4，Prisma + Supabase Postgres，见 `apps/server/AGENTS.md`「数据库/ORM 占位」）
- ❌ Best-of-3 会话格式（架构支持，逻辑暂不实现）

**扩展路径**（后续阶段）：

- Phase 3：Web UI 集成（WebSocket 连接 + 动画）
- Phase 4：数据库（Prisma + Supabase）+ 重连 + AI（`RoomService` 输入持久层）
- Phase 4+：排行榜、战绩、观战
