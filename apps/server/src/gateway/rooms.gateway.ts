import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { SeatId } from "@new-mj/core";
import { eventsVisibleTo } from "@new-mj/core";
import {
  GameActionRequestSchema,
  RoomCreateRequestSchema,
  RoomJoinRequestSchema,
  RoomReadyRequestSchema,
  type Reply,
  type RoomInfo,
} from "@new-mj/protocol";
import type { Server, Socket } from "socket.io";
import { ZodError } from "zod";
import { ConfigService } from "../config/config.service";
import { createAuthMiddleware } from "./auth.middleware";
import { ConnectionRegistry, type ConnectionInfo } from "./connection-registry";
import { EventBus } from "../rooms/event-bus";
import { RoomServiceError } from "../rooms/room-service.error";
import { RoomService } from "../rooms/room.service";

/**
 * Payload has no nickname field yet (docs/protocol.md's room:create/room:join
 * only carry rulesetId/config/roomId) — profile/nickname is out of scope for
 * this protocol version, so we derive a placeholder from userId. Flagged as
 * an open item rather than silently inventing a payload field.
 */
const defaultNickname = (userId: string): string => `Player-${userId.slice(0, 6)}`;

@WebSocketGateway({ namespace: "/", transports: ["websocket"] })
export class RoomsGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(RoomsGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly roomService: RoomService,
    private readonly eventBus: EventBus,
    private readonly connections: ConnectionRegistry,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server): void {
    server.use(createAuthMiddleware(this.jwtService, this.configService));

    this.eventBus.on("room:playerJoined", (event) => {
      this.server.to(event.roomId).emit("room:playerJoined", {
        seat: event.seat,
        nickname: event.nickname,
        isBot: event.isBot,
      });
    });
    this.eventBus.on("room:readyChanged", (event) => {
      this.server
        .to(event.roomId)
        .emit("room:readyChanged", { seat: event.seat, ready: event.ready });
    });
    this.eventBus.on("room:scoreUpdated", (event) => {
      this.server.to(event.roomId).emit("room:scoreUpdated", {
        scores: event.scores,
        gameNumber: event.gameNumber,
        totalGames: event.totalGames,
      });
    });
    this.eventBus.on("room:dealerChanged", (event) => {
      this.server
        .to(event.roomId)
        .emit("room:dealerChanged", { dealer: event.dealer, gameNumber: event.gameNumber });
    });
    this.eventBus.on("room:sessionFinished", (event) => {
      this.server.to(event.roomId).emit("room:sessionFinished", { result: event.result });
    });
    this.eventBus.on("game:snapshot", (event) => {
      const socket = this.connections.socketForSeat(event.roomId, event.seat);
      socket?.emit("game:snapshot", { view: event.view, seq: event.seq });
    });
    this.eventBus.on("game:event", (event) => {
      for (const [seat, socket] of this.connections.socketsByRoom(event.roomId)) {
        if (eventsVisibleTo([event.event], seat).length > 0) {
          socket.emit("game:event", { event: event.event });
        }
      }
    });
  }

  handleDisconnect(client: Socket): void {
    this.connections.untrack(client);
  }

  @SubscribeMessage("room:create")
  handleRoomCreate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Reply<RoomInfo> {
    return this.reply(() => {
      const userId = this.requireUserId(client);
      const parsed = RoomCreateRequestSchema.parse(payload);
      const nickname = defaultNickname(userId);
      const room = this.roomService.create(
        userId,
        nickname,
        parsed.rulesetId,
        parsed.config ?? { rulesetId: parsed.rulesetId },
        parsed.sessionFormat,
      );
      // Host is always seated at 0: create() seats the very first player of a fresh room.
      this.connections.track(client, room.id, userId, 0);
      return this.roomService.snapshot(room);
    });
  }

  @SubscribeMessage("room:join")
  handleRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Reply<RoomInfo> {
    return this.reply(() => {
      const userId = this.requireUserId(client);
      const parsed = RoomJoinRequestSchema.parse(payload);
      const player = this.roomService.join(parsed.roomId, userId, defaultNickname(userId));
      this.connections.track(client, parsed.roomId, userId, player.seatId);
      // join() throwing ROOM_NOT_FOUND is the only way this could be missing.
      const room = this.roomService.get(parsed.roomId)!;
      return this.roomService.snapshot(room);
    });
  }

  @SubscribeMessage("room:ready")
  handleRoomReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Reply<object> {
    return this.reply(() => {
      const info = this.requireConnection(client);
      const parsed = RoomReadyRequestSchema.parse(payload);
      this.roomService.ready(info.roomId, info.userId, parsed.ready);
      return {};
    });
  }

  @SubscribeMessage("room:start")
  handleRoomStart(@ConnectedSocket() client: Socket): Reply<object> {
    return this.reply(() => {
      const info = this.requireConnection(client);
      this.roomService.start(info.roomId);
      return {};
    });
  }

  @SubscribeMessage("game:action")
  handleGameAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Reply<object> {
    return this.reply(() => {
      const info = this.requireConnection(client);
      const parsed = GameActionRequestSchema.parse(payload);
      const seat = this.seatOf(info);
      this.roomService.applyPlayerAction(info.roomId, seat, parsed.action);
      return {};
    });
  }

  private seatOf(info: ConnectionInfo): SeatId {
    const room = this.roomService.get(info.roomId);
    if (!room) throw new RoomServiceError("ROOM_NOT_FOUND");
    const seat = room.players.findIndex((player) => player?.userId === info.userId);
    if (seat < 0) throw new RoomServiceError("NOT_IN_ROOM");
    return seat as SeatId;
  }

  private requireConnection(client: Socket): ConnectionInfo {
    const info = this.connections.get(client);
    if (!info) throw new RoomServiceError("NOT_IN_ROOM");
    return info;
  }

  private requireUserId(client: Socket): string {
    // The auth middleware rejects the connection before `connection` fires
    // if this isn't set, so absence here would mean a bug in that wiring.
    const userId = client.data.userId as string | undefined;
    if (!userId) throw new RoomServiceError("UNAUTHORIZED");
    return userId;
  }

  private reply<T>(fn: () => T): Reply<T> {
    try {
      return { ok: true, data: fn() };
    } catch (error) {
      if (error instanceof RoomServiceError) {
        return { ok: false, code: error.code, message: error.message };
      }
      if (error instanceof ZodError) {
        return { ok: false, code: "INVALID_CONFIG", message: error.message };
      }
      this.logger.error(error);
      return { ok: false, code: "INTERNAL" };
    }
  }
}
