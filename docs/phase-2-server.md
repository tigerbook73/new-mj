# 阶段 2：NestJS Server 架构与实施计划

> **状态**：设计完成，待执行  
> **范围**：房间管理 + Socket.IO 集成 + MVP 4-round 会话  
> **总工期**：~7-10 天单人；~4-5 天并行  

## Context

**为什么做**：阶段 1.5 core 规则引擎完成，现在需要 server 来编排多局会话、管理房间、通过 Socket.IO 与客户端通信。

**已有基础**：
- ✅ core engine 纯函数完成（junk + bloodbattle）
- ✅ protocol 类型定义完成（RoomInfo、SessionFormat 等）
- ✅ docs/rooms.md 房间模型设计完成（4-round 会话，支持 best-of-3 扩展）

**遗留问题**：
- ❌ apps/server 还是空壳（仅占位符）
- ❌ 临时的 RoomService 需要集成到 NestJS
- ❌ 依赖配置不完整（缺 zod、@nestjs/* 等）

---

## 推荐方案：5 阶段顺序实施

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

**事件流示意**：
```
Client: room:join {roomId} ack request
  ↓
Server: RoomsGateway.handleJoin() → RoomService.join()
  ├─ ack: {ok: true, data: RoomInfo snapshot}
  └─ broadcast: room:playerJoined {seat, nickname} → 房间内所有人

Client: game:action {discard 5m} ack request  
  ↓
Server: RoomsGateway.handleGameAction() → RoomService.applyPlayerAction()
  ├─ delegate to GameService.applyAction(state, seat, action)
  ├─ extract Settled events → accumulateScores()
  ├─ ack: {ok: true}
  └─ broadcast: game:event {event, deadline?} → 按座位可见性过滤分发
  
Game ends:
  ↓ 
Server: RoomService.handleGameEnd() → nextGame() or finish()
  ├─ emit room:scoreUpdated {scores, gameNumber}
  ├─ emit room:dealerChanged {dealer, gameNumber}
  └─ emit game:snapshot {view, seq} → 新一局开始
```

---

## 5 阶段分解

### 阶段 1：脚手架（1-2 天）

**目标**：建立 NestJS 项目基础，能启动 server

**创建文件**：
- `apps/server/src/main.ts` — 启动入口
- `apps/server/src/app.module.ts` — DI 容器（导入所有 submodule）
- `apps/server/src/config/config.module.ts`, `config.service.ts` — 环境变量 + 常量
- `apps/server/src/core/core.module.ts`, `game.service.ts` — 包装 @new-mj/core 的 GameService
- `apps/server/package.json` — 新增依赖
- `apps/server/tsconfig.json` — NestJS 配置（decorators、outDir）
- `apps/server/jest.config.js` — 测试配置

**修改文件**：
- `apps/server/src/index.ts` — 导出 RoomService（暂时）

**新增依赖**：
```json
{
  "@nestjs/common": "^10",
  "@nestjs/core": "^10",
  "@nestjs/websockets": "^10",
  "@nestjs/platform-socket.io": "^10",
  "socket.io": "^4.8",
  "class-validator": "^0.14",
  "class-transformer": "^0.5",
  "jest": "^29",
  "ts-jest": "^29"
}
```

**关键类/接口**：
```ts
// game.service.ts
class GameService {
  createGame(rulesetId, config): { state, events }
  applyAction(state, seat, action): ApplyResult
  getPlayerView(state, seat): PlayerViewBase
  getLegalActions(state, seat): readonly Action[]
}

// config.service.ts
class ConfigService {
  PROTOCOL_VERSION = "1.0"
  JWT_SECRET = process.env.JWT_SECRET
  SOCKET_PORT = process.env.SOCKET_PORT || 3001
}
```

**复杂度**：低（标准 NestJS 脚手架）

**最小 commit**：
1. `chore(server): bootstrap NestJS project + core wrapper`
2. `chore(server): add ConfigService + GameService stub`

**测试方式**：
- `npm run build` 无错误
- `npm run start` 启动服务（即使无 gateway 也能启动）

---

### 阶段 2：文档（0.5 天）*可与阶段 1 并行*

**目标**：定义 server package 的规范和约定

**创建文件**：
- `apps/server/CLAUDE.md` — 指向 AGENTS.md
- `apps/server/AGENTS.md` — package 级规范（完整文档）

**AGENTS.md 内容**（参考 packages/core/AGENTS.md 的结构）：
```markdown
# apps/server AGENTS.md

## package 职责

- server 是 gateway 与 core 的中介
- 禁止在 server 中实现业务规则（规则只在 core）
- Socket.IO 消息分层：ack（同步回执）vs event（异步广播）

## 代码约定

- src/{config,core,rooms,gateway,events}/ 按职责划分
- 所有 Socket.IO 事件必须经过 RoomService 状态检查
- 可见性过滤用 core 提供的 eventsVisibleTo()，不自己判断规则

## DoD

- `pnpm typecheck` ✅
- `pnpm lint` ✅ 
- `pnpm test` ✅（≥80% 覆盖率）
- Socket.IO 测试用 socket.io-client 模拟客户端
- 所有错误码必须匹配 protocol.md §4
```

**复杂度**：低（纯文档）

**最小 commit**：
1. `docs(server): add CLAUDE.md + AGENTS.md`

---

### 阶段 3：核心服务（1-2 天）

**目标**：实现 RoomService、GameSession、EventBus，房间编排逻辑完整

**创建/修改文件**：

1. **apps/server/src/rooms/room.service.ts**（增强已有骨架）：
   ```ts
   @Injectable()
   class RoomService {
     create(id, rulesetId, config, sessionFormat, hostUserId): GameRoom
     join(roomId, userId, nickname): GameRoom | null
     setReady(roomId, userId, ready): boolean
     canStart(room): boolean
     
     // 游戏编排
     startGame(room): Promise<void>
     applyPlayerAction(room, seat, action): Promise<void>
     handleGameEnd(room, result): Promise<void>
     nextGame(room): Promise<void>
     
     // 辅助计算
     accumulateScores(room, scoreDeltas): void
     computeNextDealer(sessionFormat, currentDealer): SeatId
     shouldContinue(room): boolean
     computeRanking(room): RankingEntry[]
     
     // 工具
     snapshot(room): RoomInfo
     get(roomId): GameRoom | null
     listOpen(): RoomInfo[]
   }
   ```

2. **apps/server/src/rooms/game-session.ts**（新增）：
   ```ts
   interface GameSession {
     gameNumber: number
     gameState: GameState
     playerViews: [PlayerViewBase, PlayerViewBase, PlayerViewBase, PlayerViewBase]
     // 游戏中的临时状态
   }
   ```

3. **apps/server/src/rooms/room.events.ts**（新增）：
   ```ts
   // 类型定义，对应 protocol 的事件 payload
   interface PlayerJoinedPayload { seat, nickname, isBot }
   interface ScoreUpdatedPayload { scores, gameNumber, totalGames? }
   interface DealerChangedPayload { dealer, gameNumber }
   interface SessionFinishedPayload { result }
   ```

4. **apps/server/src/events/event-bus.ts**（新增）：
   ```ts
   @Injectable()
   class EventBus extends EventEmitter {
     // 简单包装 Node.js EventEmitter
     // MVP 用本地 emitter，phase 4 可换成 Redis 或 Bull
   }
   ```

5. **apps/server/src/rooms/rooms.module.ts**（新增）：
   ```ts
   @Module({
     imports: [CoreModule], // 依赖 GameService
     providers: [RoomService, EventBus],
     exports: [RoomService, EventBus],
   })
   class RoomsModule {}
   ```

**关键逻辑**：

**startGame 流程**：
```ts
async startGame(room: GameRoom): Promise<void> {
  // 1. 调用 GameService.createGame() 初始化状态
  const result = this.gameService.createGame(room.config);
  room.gameState = result.state;
  room.playerViews = [
    this.gameService.getPlayerView(result.state, 0),
    this.gameService.getPlayerView(result.state, 1),
    this.gameService.getPlayerView(result.state, 2),
    this.gameService.getPlayerView(result.state, 3),
  ];
  
  // 2. 转移房间状态
  room.phase = "in-game";
  
  // 3. 广播事件（EventBus.emit）
  this.eventBus.emit('game:started', { room: this.snapshot(room) });
  
  // 4. 等待第一个合法动作（客户端侧）
}
```

**applyPlayerAction 流程**：
```ts
async applyPlayerAction(room: GameRoom, seat: SeatId, action: Action): Promise<void> {
  // 1. 校验
  if (room.phase !== 'in-game') throw GAME_NOT_IN_PROGRESS;
  
  // 2. 调用 core engine
  const result = this.gameService.applyAction(room.gameState, seat, action);
  if ('error' in result) throw result.error;
  
  // 3. 更新状态
  room.gameState = result.state;
  
  // 4. 广播事件（按座位可见性过滤）
  result.events.forEach(event => {
    this.eventBus.emit('game:event', { event, seat, visibility: event.visibility });
  });
  
  // 5. 如果游戏结束，触发 handleGameEnd
  if (result.state.phase === 'finished') {
    await this.handleGameEnd(room, result);
  }
}
```

**handleGameEnd + nextGame 流程**：
```ts
async handleGameEnd(room: GameRoom, result: ApplyResult): Promise<void> {
  // 1. 从事件中提取分数
  const scoreDeltas = this.extractScoreDeltas(result.events);
  
  // 2. 累加到房间总分
  this.accumulateScores(room, scoreDeltas);
  
  // 3. 广播分数更新
  this.eventBus.emit('room:scoreUpdated', {
    scores: room.scores,
    gameNumber: room.gameNumber,
    totalGames: room.totalGames,
  });
  
  // 4. 检查是否继续
  if (!this.shouldContinue(room)) {
    // 会话结束
    room.phase = 'finished';
    room.status = 'closed';
    room.finishedAt = Date.now();
    
    const ranking = this.computeRanking(room);
    room.result = {
      winner: ranking[0].seatId,
      ranking,
      format: room.sessionFormat,
      gamesPlayed: room.gameNumber,
    };
    
    this.eventBus.emit('room:sessionFinished', { result: room.result });
    return;
  }
  
  // 5. 进入下一局
  await this.nextGame(room);
}

async nextGame(room: GameRoom): Promise<void> {
  // 1. 更新庄家
  room.dealer = this.computeNextDealer(room.sessionFormat, room.dealer);
  
  // 2. 增加局数
  room.gameNumber += 1;
  
  // 3. 广播
  this.eventBus.emit('room:dealerChanged', {
    dealer: room.dealer,
    gameNumber: room.gameNumber,
  });
  
  // 4. 初始化下一局（重复 startGame 逻辑）
  const result = this.gameService.createGame(room.config);
  room.gameState = result.state;
  room.playerViews = [...];
  
  // 5. 广播新的 game:snapshot
  this.eventBus.emit('game:snapshot', { views: room.playerViews });
}
```

**extractScoreDeltas 辅助**：
```ts
private extractScoreDeltas(events: GameEvent[]): [number, number, number, number] {
  const deltas = [0, 0, 0, 0] as [number, number, number, number];
  
  events.forEach(e => {
    if (e.payload?.type === 'Settled') {
      e.payload.scoreDeltas.forEach((delta, i) => {
        deltas[i] += delta;
      });
    }
  });
  
  return deltas;
}
```

**复杂度**：中等（状态机 + 事件编排）

**最小 commit**：
1. `feat(server): implement RoomService orchestration (create, join, ready)`
2. `feat(server): implement game lifecycle (startGame, applyAction, nextGame)`
3. `feat(server): add EventBus + game-session + room.events types`

**测试方式**：
- 单元测试（jest）：RoomService 的每个公共方法
  - 房间创建 + 加入 + 就绪检查
  - 分数累加逻辑
  - 庄家轮转
  - shouldContinue 判定
- 不涉及 Socket.IO（后续集成测试时测）

---

### 阶段 4：Socket.IO Gateway（2-3 天）

**目标**：WebSocket 入口，消息路由，可见性过滤，错误处理

**创建文件**：

1. **apps/server/src/gateway/rooms.gateway.ts**：
   ```ts
   @WebSocketGateway({ namespace: '/', transports: ['websocket'] })
   class RoomsGateway {
     @SubscribeMessage('room:create')
     async handleRoomCreate(client: Socket, payload: RoomCreateRequest) {
       // ack 模式：同步返回 RoomInfo 快照
     }
     
     @SubscribeMessage('room:join')
     async handleRoomJoin(client: Socket, payload: RoomJoinRequest) { }
     
     @SubscribeMessage('room:ready')
     async handleRoomReady(client: Socket, payload: RoomReadyRequest) { }
     
     @SubscribeMessage('room:start')
     async handleRoomStart(client: Socket, payload: RoomStartRequest) { }
     
     @SubscribeMessage('game:action')
     async handleGameAction(client: Socket, payload: GameActionRequest) { }
     
     // 连接生命周期
     handleConnection(client: Socket) { }
     handleDisconnect(client: Socket) { }
   }
   ```

2. **apps/server/src/gateway/auth.guard.ts**（AuthGuard）：
   ```ts
   @Injectable()
   class AuthGuard implements CanActivate {
     canActivate(context: ExecutionContext): boolean {
       const client = context.switchToWs().getClient<Socket>();
       const token = client.handshake.auth.token;
       
       // JWT 解码，绑定 socket.data.userId
       const payload = this.jwtService.verify(token);
       client.data.userId = payload.sub;
       
       return true;
     }
   }
   ```

3. **apps/server/src/gateway/gateway.module.ts**：
   ```ts
   @Module({
     imports: [RoomsModule, AuthModule],
     providers: [RoomsGateway],
   })
   class GatewayModule {}
   ```

**消息处理示例**（room:create）：
```ts
@SubscribeMessage('room:create')
async handleRoomCreate(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: RoomCreateRequest,
): Promise<{ok: boolean, data?: RoomInfo, code?: string}> {
  const userId = client.data.userId; // 从 AuthGuard 获取
  
  try {
    // 1. 验证 payload
    const validated = RoomCreateRequestSchema.parse(payload);
    
    // 2. 调用 RoomService
    const room = this.roomService.create(
      generateId(),
      validated.rulesetId,
      validated.config,
      validated.sessionFormat || 'default',
      userId,
    );
    
    // 3. 玩家加入 Socket.IO 房间
    client.join(`room:${room.id}`);
    
    // 4. ack 响应
    return { ok: true, data: this.roomService.snapshot(room) };
  } catch (error) {
    return { ok: false, code: 'INVALID_CONFIG', message: error.message };
  }
}
```

**消息处理示例**（game:action）：
```ts
@SubscribeMessage('game:action')
async handleGameAction(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: GameActionRequest,
): Promise<{ok: boolean, code?: string}> {
  const userId = client.data.userId;
  
  try {
    // 1. 获取房间和座位
    const room = this.getRoomByClientId(client.id);
    if (!room) throw new RoomNotFoundError();
    
    const seat = room.players.findIndex(p => p?.userId === userId);
    if (seat < 0) throw new NotInRoomError();
    
    // 2. 调用 RoomService（内部调用 GameService.applyAction）
    await this.roomService.applyPlayerAction(room, seat as SeatId, payload.action);
    
    // 3. ack 回执（仅表示受理）
    return { ok: true };
    
    // 4. 事件广播由 RoomService 内部的 EventBus 处理
    //    (见阶段 3 的事件流)
  } catch (error) {
    return { ok: false, code: error.code };
  }
}
```

**可见性过滤**（游戏事件广播）：
```ts
// 在 EventBus 的 emit 处理器中（或 Gateway 中）
private broadcastGameEvent(roomId: string, event: GameEvent): void {
  const room = this.roomService.get(roomId);
  if (!room) return;
  
  // 对每个座位，过滤可见事件
  room.players.forEach((player, seatId) => {
    if (!player) return;
    
    const visible = eventsVisibleTo([event], seatId as SeatId).length > 0;
    if (!visible) return;
    
    // 只向该座位的客户端推送
    this.server.to(`seat:${seatId}@room:${roomId}`).emit('game:event', {
      event,
      deadline: deadline, // 可选，server 附加
    });
  });
}
```

**错误处理**（必须匹配 protocol.md §4）：
```ts
// 错误码映射表
const ERROR_CODES = {
  UNAUTHORIZED: 'socket.data.userId 缺失（握手失败）',
  ROOM_NOT_FOUND: '房间不存在',
  ROOM_FULL: '房间已满（4 人）',
  ALREADY_IN_ROOM: '玩家已在另一个房间',
  NOT_IN_ROOM: '玩家不在该房间',
  GAME_IN_PROGRESS: '对局正在进行中',
  NOT_YOUR_TURN: '不是你的回合',
  ILLEGAL_ACTION: '非法动作（附 core 的 error code）',
  INVALID_CONFIG: 'config 校验失败',
};
```

**复杂度**：中-高（NestJS + Socket.IO 模式，可见性过滤）

**最小 commit**：
1. `feat(server): add RoomsGateway with room lifecycle handlers`
2. `feat(server): implement game:action handler + visible event broadcast`
3. `feat(server): add AuthGuard + error code mapping`

**测试方式**：
- 单元测试：AuthGuard、错误处理
- 集成测试（使用 socket.io-client 模拟客户端）：
  - room:create → ack + broadcast room:playerJoined
  - room:join × 3 → 房间满
  - room:ready × 4 → room:start
  - game:action → ack + game:event（按座位过滤）

---

### 阶段 5：集成与 E2E 测试（1-2 天）

**目标**：端到端验证 4 人游戏完整流程（创建 → 开始 → 1 局完成 → 排名）

**创建文件**：

1. **apps/server/test/integration/rooms.e2e-spec.ts**：
   ```ts
   describe('Rooms E2E - 4 Player Full Session', () => {
     it('should complete 1 full game with 4 players', async () => {
       // 1. 创建房间
       const room = service.create(...);
       
       // 2. 4 个玩家加入
       service.join(room.id, 'user1', '玩家1');
       service.join(room.id, 'user2', '玩家2');
       service.join(room.id, 'user3', '玩家3');
       service.join(room.id, 'user4', '玩家4');
       
       // 3. 全部就绪
       service.setReady(room.id, 'user1', true);
       service.setReady(room.id, 'user2', true);
       service.setReady(room.id, 'user3', true);
       service.setReady(room.id, 'user4', true);
       
       // 4. 开始游戏
       await service.startGame(room);
       expect(room.phase).toBe('in-game');
       
       // 5. 模拟一局游戏（用 core 的 createGame 结果）
       const result = core.createGame(room.config);
       // 执行 N 步随机合法动作，直到游戏结束
       
       // 6. 检查状态转移
       expect(room.phase).toBe('finished');
       expect(room.result).toBeDefined();
       expect(room.result.gamesPlayed).toBe(1);
     });
   });
   ```

2. **apps/server/test/unit/room.service.spec.ts**：
   ```ts
   describe('RoomService', () => {
     it('should accumulate scores correctly', () => {
       const room = service.create(...);
       service.accumulateScores(room, [100, -30, -40, -30]);
       expect(room.scores).toEqual([100, -30, -40, -30]);
       
       service.accumulateScores(room, [50, 0, 25, -75]);
       expect(room.scores).toEqual([150, -30, -15, -105]);
     });
     
     it('should rotate dealer clockwise', () => {
       expect(service.computeNextDealer('4-round', 0)).toBe(1);
       expect(service.computeNextDealer('4-round', 3)).toBe(0);
     });
     
     it('should determine session end at 4-round', () => {
       const room = { gameNumber: 3, totalGames: 4, sessionFormat: '4-round' };
       expect(service.shouldContinue(room)).toBe(true);
       
       room.gameNumber = 4;
       expect(service.shouldContinue(room)).toBe(false);
     });
   });
   ```

3. **apps/server/test/fixtures/mock-actions.ts**：
   ```ts
   // 预定义的合理动作序列（用于 fuzz 或 E2E）
   export const mockGameActions = {
     bloodbattle: [
       { type: 'discard', tile: 0 },
       { type: 'discard', tile: 1 },
       // ...
     ],
   };
   ```

4. **apps/server/test/unit/game.service.spec.ts**：
   ```ts
   describe('GameService', () => {
     it('should wrap core.createGame', () => {
       const result = service.createGame('bloodbattle', config);
       expect(result).toHaveProperty('state');
       expect(result).toHaveProperty('events');
     });
     
     it('should delegate applyAction to core', () => {
       const action = { type: 'discard', tile: 0 };
       const result = service.applyAction(state, 0, action);
       expect(result).toHaveProperty('state');
       expect(result).toHaveProperty('events');
     });
   });
   ```

**DoD（验收标准）**：
- [ ] 4 玩家创建房间 → 加入 → 就绪 → 开始 ✅
- [ ] Core engine 驱动完整 1 局游戏 ✅
- [ ] 分数正确累加 ✅
- [ ] 房间状态转移（waiting → in-game → finished）✅
- [ ] 最终排名计算正确 ✅
- [ ] 所有错误码匹配 protocol.md ✅
- [ ] `pnpm typecheck && pnpm lint && pnpm test` 全绿 ✅
- [ ] 手工测试：4 个 socket.io-client 模拟客户端完整流程 ✅

**复杂度**：中等（async/await + Socket 客户端模拟）

**最小 commit**：
1. `test(server): add E2E integration test (4-player full game)`
2. `test(server): add unit tests for RoomService + GameService`

**测试运行**：
```bash
# 单元测试
pnpm test room.service.spec.ts
pnpm test game.service.spec.ts

# 集成测试
pnpm test rooms.e2e-spec.ts
```

---

## 并行化机会

✅ **可并行**（相互独立）：
- 阶段 1（脚手架）与 阶段 2（文档）
- 阶段 2（文档）与 阶段 3（服务）

⏱️ **必须串行**（有依赖）：
- 阶段 1 → 阶段 3（GameService 和 RoomsModule 需等 app.module 建好）
- 阶段 3 → 阶段 4（Gateway 需调用 RoomService）
- 阶段 4 → 阶段 5（集成测试需 Gateway 完整）

**最优排期**：
```
Day 1:     [Stage 1: Scaffold] ━━━━━ [Stage 2: Docs] ━━━
Day 2-3:                         [Stage 3: Services] ━━━━
Day 4-5:                                            [Stage 4: Gateway] ━━━━
Day 6-7:                                                   [Stage 5: Tests] ━━
```

---

## 每阶段 commit 清单

| 阶段 | Commit 数 | 消息示例 |
|------|----------|---------|
| 1 | 2 | `chore(server): bootstrap NestJS` + `feat(server): add GameService` |
| 2 | 1 | `docs(server): add CLAUDE.md + AGENTS.md` |
| 3 | 3 | `feat(server): RoomService orchestration` + `feat(server): game lifecycle` + `feat(server): EventBus` |
| 4 | 3 | `feat(server): RoomsGateway` + `feat(server): event broadcast + visibility filter` + `feat(server): AuthGuard` |
| 5 | 2 | `test(server): E2E integration` + `test(server): unit tests` |
| **总计** | **~11** | 小、可审阅的 PR |

---

## 关键实现细节

**1. 分数提取从事件**：
```ts
private extractScoreDeltas(events: GameEvent[]): [number, number, number, number] {
  const deltas = [0, 0, 0, 0] as [number, number, number, number];
  events.forEach(e => {
    if (e.payload?.type === 'Settled') {
      e.payload.scoreDeltas.forEach((delta, i) => deltas[i] += delta);
    }
  });
  return deltas;
}
```

**2. 可见性过滤（per-seat broadcast）**：
```ts
import { eventsVisibleTo } from '@new-mj/core';

const visible = eventsVisibleTo([event], seatId as SeatId).length > 0;
if (visible) {
  this.server.to(`seat:${seatId}@room:${roomId}`).emit('game:event', { event });
}
```

**3. 庄家轮转（MVP：简单顺时针）**：
```ts
computeNextDealer(format: SessionFormat, current: SeatId): SeatId {
  return ((current + 1) % 4) as SeatId;
}
```

**4. 会话终止判定**：
```ts
shouldContinue(room: GameRoom): boolean {
  if (room.sessionFormat === 'best-of-3') {
    // TODO: Check wins[X] >= 2
    return false;
  }
  return (room.totalGames ?? 4) > room.gameNumber;
}
```

---

## 关键文件清单（实施前必读）

1. `docs/protocol.md` — Socket.IO ack/event 规范
2. `docs/rooms.md` — 房间状态机 + 计分逻辑
3. `packages/protocol/src/schemas.ts` — Zod 类型定义
4. `packages/core/src/engine.ts` — GameService 目标 API
5. `packages/core/AGENTS.md` — Package 规范参考
6. `docs/decisions.md` — D1、D11、D12 决策背景

---

## 验收与验证

**最终检查清单**：
- [ ] `pnpm typecheck` 无错误
- [ ] `pnpm lint` 无违规
- [ ] `pnpm test` ≥80% 覆盖率，全部通过
- [ ] `socket.io-client` × 4 手工测试完整流程
- [ ] 所有错误码映射到 protocol.md §4
- [ ] 没有在 server 中实现规则（规则只在 core）
- [ ] 所有 Socket.IO 消息遵循 ack/event 分离原则
- [ ] 可见性过滤用 core 的 `eventsVisibleTo()`

**end-to-end 验证命令**：
```bash
cd apps/server

# 构建
pnpm build

# 测试
pnpm test

# 验证
pnpm verify

# 手工测试（启动 server + 4 个客户端模拟器）
node scripts/test-e2e.js
```

---

## 已知限制与未来扩展

**MVP 不做**（但设计已预留扩展点）：
- ❌ 超时强制 pass（即时决策 OK）
- ❌ AI 玩家管理（评审点 H）
- ❌ 重连/恢复（phase 4）
- ❌ 持久化（phase 4 + PG）
- ❌ Best-of-3 会话格式（架构支持，逻辑暂不实现）

**扩展路径**（后续阶段）：
- Phase 3：Web UI 集成（WebSocket 连接 + 动画）
- Phase 4：数据库 + 重连 + AI（RoomService 输入持久层）
- Phase 4+：排行榜、战绩、观战
