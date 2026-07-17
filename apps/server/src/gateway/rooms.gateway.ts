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
  DebugReplayOmniscientViewRequestSchema,
  GameActionRequestSchema,
  LobbyListRequestSchema,
  ReplayGetRequestSchema,
  RoomAddBotRequestSchema,
  RoomCreateRequestSchema,
  RoomEnterRequestSchema,
  RoomJoinRequestSchema,
  RoomPeekRequestSchema,
  RoomReadyRequestSchema,
  RoomRemoveBotRequestSchema,
  RoomRemovePlayerRequestSchema,
  type DebugOmniscientView,
  type Reply,
  type ReplayGetResponse,
  type RoomInfo,
  type RoomParticipant,
  type RoomSummary,
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
const defaultNickname = (userId: string): string => {
  const username = userId.replace(/-[a-z0-9]{6}$/, "");
  return (
    username
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "User"
  );
};

/**
 * origin: true reflects the request's Origin header — web/mobile run on a
 * different port than the server in dev and e2e (D7: non-commercial, no
 * cookies/credentials involved, auth is the handshake JWT not a session
 * cookie, so a permissive-but-explicit CORS policy is fine here).
 */
@WebSocketGateway({ namespace: "/", transports: ["websocket"], cors: { origin: true } })
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
        ...(event.avatar ? { avatar: event.avatar } : {}),
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
    this.eventBus.on("room:playerLeft", (event) => {
      this.server.to(event.roomId).emit("room:playerLeft", { seat: event.seat });
    });
    this.eventBus.on("room:closed", (event) => {
      this.server.to(event.roomId).emit("room:closed", { reason: event.reason });
      for (const socket of this.connections.allSocketsByRoom(event.roomId)) {
        socket.leave(event.roomId);
        this.connections.untrack(socket);
      }
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
    const info = this.connections.get(client);
    this.connections.untrack(client);
    if (info) {
      this.roomService.handleDisconnect(info.roomId, info.userId);
      if (this.roomService.get(info.roomId)) {
        this.server.to(info.roomId).emit("room:participantLeft", { userId: info.userId });
      }
    }
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
        parsed.name,
      );
      // Host is always seated at 0: create() seats the very first player of a fresh room.
      this.connections.track(client, room.id, userId, nickname, 0);
      return this.snapshotWithParticipants(room.id);
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
      const player = this.roomService.join(
        parsed.roomId,
        userId,
        defaultNickname(userId),
        parsed.seat,
      );
      const nickname = defaultNickname(userId);
      this.connections.track(client, parsed.roomId, userId, nickname, player.seatId);
      this.emitParticipantJoined(parsed.roomId, userId, nickname, true, false);
      // join() throwing ROOM_NOT_FOUND is the only way this could be missing.
      const room = this.roomService.get(parsed.roomId)!;
      return this.snapshotWithParticipants(parsed.roomId);
    });
  }

  @SubscribeMessage("lobby:list")
  handleLobbyList(@MessageBody() payload: unknown): Reply<RoomSummary[]> {
    return this.reply(() => {
      const parsed = LobbyListRequestSchema.parse(payload);
      return this.roomService.list(parsed.rulesetId, parsed.search);
    });
  }

  @SubscribeMessage("room:peek")
  handleRoomPeek(@MessageBody() payload: unknown): Reply<RoomInfo> {
    return this.reply(() => {
      const parsed = RoomPeekRequestSchema.parse(payload);
      return this.roomService.peek(parsed.roomId);
    });
  }

  @SubscribeMessage("room:enter")
  handleRoomEnter(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Reply<RoomInfo> {
    return this.reply(() => {
      const userId = this.requireUserId(client);
      const parsed = RoomEnterRequestSchema.parse(payload);
      const room = this.roomService.get(parsed.roomId);
      if (!room) throw new RoomServiceError("ROOM_NOT_FOUND");
      const nickname = defaultNickname(userId);
      this.connections.enter(client, parsed.roomId, userId, nickname);
      this.emitParticipantJoined(parsed.roomId, userId, nickname, false, false);
      return this.snapshotWithParticipants(parsed.roomId);
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
      this.roomService.start(info.roomId, info.userId);
      return {};
    });
  }

  @SubscribeMessage("room:addBot")
  handleRoomAddBot(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Reply<object> {
    return this.reply(() => {
      const info = this.requireConnection(client);
      const parsed = RoomAddBotRequestSchema.parse(payload);
      this.roomService.addBot(info.roomId, info.userId, parsed.seat);
      return {};
    });
  }

  @SubscribeMessage("room:removeBot")
  handleRoomRemoveBot(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Reply<object> {
    return this.reply(() => {
      const info = this.requireConnection(client);
      const parsed = RoomRemoveBotRequestSchema.parse(payload);
      this.roomService.removeBot(info.roomId, info.userId, parsed.seat);
      return {};
    });
  }

  @SubscribeMessage("room:removePlayer")
  handleRoomRemovePlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Reply<object> {
    return this.reply(() => {
      const info = this.requireConnection(client);
      const parsed = RoomRemovePlayerRequestSchema.parse(payload);
      const targetSocket = this.connections.socketForSeat(info.roomId, parsed.seat);
      const removed = this.roomService.removePlayer(info.roomId, info.userId, parsed.seat);
      if (!removed.isBot && targetSocket) {
        targetSocket.emit("room:kicked", { reason: "removedByHost" });
        targetSocket.leave(info.roomId);
        this.connections.untrack(targetSocket);
      }
      return {};
    });
  }

  @SubscribeMessage("room:leave")
  handleRoomLeave(@ConnectedSocket() client: Socket): Reply<object> {
    return this.reply(() => {
      const info = this.requireConnection(client);
      const room = this.roomService.get(info.roomId);
      const isSeated = room?.players.some((player) => player?.userId === info.userId) ?? false;
      if (isSeated) this.roomService.leave(info.roomId, info.userId);
      if (this.roomService.get(info.roomId)) {
        this.server.to(info.roomId).emit("room:participantLeft", { userId: info.userId });
      }
      client.leave(info.roomId);
      this.connections.untrack(client);
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

  /**
   * Dev/test-only escape hatch (decisions.md D19, protocol-shared.md §7) —
   * gated by ALLOW_DEBUG_OMNISCIENT, never reachable from production UI.
   * Deliberately bypasses getPlayerView's visibility filtering.
   */
  @SubscribeMessage("debug:omniscientView")
  handleDebugOmniscientView(@ConnectedSocket() client: Socket): Reply<DebugOmniscientView> {
    return this.reply(() => {
      if (!this.configService.allowDebugOmniscient) throw new RoomServiceError("UNAUTHORIZED");
      const info = this.requireConnection(client);
      this.seatOf(info);
      const view = this.roomService.getOmniscientView(info.roomId);
      return { wall: [...view.wall], hands: view.hands.map((hand) => [...hand]) };
    });
  }

  /**
   * phase 4.5 step 3 — query, not gated by the room membership
   * registry (a player who already left the room may still replay a game
   * they were seated in), only by handshake identity + RoomService's own
   * seatUserIds check for that specific archived game.
   */
  @SubscribeMessage("replay:get")
  handleReplayGet(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<Reply<ReplayGetResponse>> {
    return this.replyAsync(() => {
      const userId = this.requireUserId(client);
      const parsed = ReplayGetRequestSchema.parse(payload);
      return this.roomService.getReplay(parsed.roomId, parsed.gameNumber, userId);
    });
  }

  /**
   * phase 4.5 step 5 — 明牌 replay, end-of-game only. Same gate as
   * handleDebugOmniscientView above (ALLOW_DEBUG_OMNISCIENT + current room
   * membership), not the "any past participant" model handleReplayGet uses.
   */
  @SubscribeMessage("debug:replayOmniscientView")
  handleDebugReplayOmniscientView(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<Reply<DebugOmniscientView>> {
    return this.replyAsync(async () => {
      if (!this.configService.allowDebugOmniscient) throw new RoomServiceError("UNAUTHORIZED");
      const info = this.requireConnection(client);
      this.seatOf(info);
      const parsed = DebugReplayOmniscientViewRequestSchema.parse(payload);
      const view = await this.roomService.getReplayOmniscientView(info.roomId, parsed.gameNumber);
      return { wall: [...view.wall], hands: view.hands.map((hand) => [...hand]) };
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

  private snapshotWithParticipants(roomId: string): RoomInfo {
    const room = this.roomService.get(roomId);
    if (!room) throw new RoomServiceError("ROOM_NOT_FOUND");
    const participants = new Map<string, RoomParticipant>();
    for (const player of room.players) {
      if (player && !player.isBot) {
        participants.set(player.userId, {
          userId: player.userId,
          nickname: player.nickname,
          ...(player.avatar ? { avatar: player.avatar } : {}),
          isSeated: true,
          isBot: false,
        });
      }
    }
    for (const info of this.connections.infosByRoom(roomId)) {
      participants.set(info.userId, {
        userId: info.userId,
        nickname: info.nickname,
        isSeated: room.players.some((player) => player?.userId === info.userId),
        isBot: false,
      });
    }
    return { ...this.roomService.snapshot(room), participants: [...participants.values()] };
  }

  private emitParticipantJoined(
    roomId: string,
    userId: string,
    nickname: string,
    isSeated: boolean,
    isBot: boolean,
  ): void {
    if (isBot) return;
    this.server.to(roomId).emit("room:participantJoined", {
      participant: { userId, nickname, isSeated, isBot: false },
    });
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

  /**
   * phase 5.3 — only the two handlers that may fall back to a DB read
   * (replay:get / debug:replayOmniscientView) need this; every other
   * handler stays on the synchronous `reply()` above unchanged.
   */
  private async replyAsync<T>(fn: () => Promise<T>): Promise<Reply<T>> {
    try {
      return { ok: true, data: await fn() };
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
