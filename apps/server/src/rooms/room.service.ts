import { randomInt, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { chooseAction, recommendAction } from "@new-mj/ai";
import {
  eventsVisibleTo,
  type ApplyResult,
  type GameConfig,
  type GameEvent,
  type OmniscientView,
  type PlayerViewBase,
  type SeatId,
} from "@new-mj/core";
import type {
  GameAdviceResponse,
  RankingEntry,
  RoomInfo,
  RoomSummary,
  SessionFormat,
} from "@new-mj/protocol";
import { ConfigService } from "../config/config.service";
import { GameService } from "../core/game.service";
import { PersistenceService } from "../persistence/persistence.service";
import { EventBus } from "./event-bus";
import type { FinishedGameLog, Room, RoomPlayer } from "./room";
import { RoomServiceError } from "./room-service.error";

const ROOM_SIZE = 4;
const DEFAULT_TOTAL_GAMES = 4;
const MAX_SEED = 2 ** 31;

interface SettledPayload {
  type: "Settled";
  scoreDeltas: [number, number, number, number];
}

interface ClaimTimer {
  deadline: number;
  timer: NodeJS.Timeout;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSettledPayload = (payload: unknown): payload is SettledPayload =>
  isRecord(payload) && payload.type === "Settled" && Array.isArray(payload.scoreDeltas);

const isGameEndedPayload = (payload: unknown): boolean =>
  isRecord(payload) && payload.type === "GameEnded";

@Injectable()
export class RoomService {
  private readonly rooms = new Map<string, Room>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly claimTimers = new Map<string, ClaimTimer>();
  /**
   * userId → roomId, server-truth source for client restore (session:identity's
   * activeRoom, see docs/contracts/session-mechanics.md §12). Only tracks real
   * players — bots use synthetic `bot:${uuid}` ids and are never seated via a
   * client restore path. Deliberately *not* cleared when a seat transitions to
   * isAutoPiloted — the user should still be able to be routed back to that
   * room to spectate. Cleared only when the seat is actually freed (leave/
   * removePlayer) or the room stops being a valid destination (abandoned/
   * session finished).
   */
  private readonly playerRooms = new Map<string, string>();

  constructor(
    private readonly gameService: GameService,
    private readonly eventBus: EventBus,
    private readonly persistenceService: PersistenceService,
    private readonly configService: ConfigService,
  ) {}

  create(
    hostUserId: string,
    hostNickname: string,
    rulesetId: string,
    config: GameConfig,
    sessionFormat: SessionFormat = "4-round",
    name?: string,
    avatar?: string,
  ): Room {
    const room: Room = {
      id: randomUUID(),
      name: name?.trim() || `${hostNickname}'s room`,
      ownerUserId: hostUserId,
      ownerNickname: hostNickname,
      rulesetId,
      config,
      sessionFormat,
      phase: "waiting",
      status: "open",
      players: [null, null, null, null],
      scores: [0, 0, 0, 0],
      gameNumber: 0,
      totalGames: sessionFormat === "4-round" ? DEFAULT_TOTAL_GAMES : undefined,
      wins: sessionFormat === "best-of-3" ? [0, 0, 0, 0] : undefined,
      dealer: 0,
      seed: 0,
      lastEventSeq: 0,
      awaitingNextRound: false,
      createdAt: Date.now(),
      currentGameEvents: [],
      currentGameSeatUserIds: [null, null, null, null],
      finishedGames: [],
    };
    this.rooms.set(room.id, room);
    this.seatPlayer(room, hostUserId, hostNickname, false, undefined, avatar);
    return room;
  }

  /**
   * lobby:list — only rooms a new player could actually join right now
   * (MVP has no spectating a room that's already in-game or finished).
   */
  list(rulesetId: string, search?: string): RoomSummary[] {
    const query = search?.trim().toLowerCase();
    const results: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.rulesetId !== rulesetId) continue;
      if (room.phase !== "waiting" || room.status !== "open") continue;
      if (query && !room.name.toLowerCase().includes(query)) continue;
      results.push({
        id: room.id,
        name: room.name,
        rulesetId: room.rulesetId,
        creator: room.ownerNickname,
        createdAt: room.createdAt,
        playerCount: room.players.filter((player) => player !== null).length,
        status: room.status,
      });
    }
    return results;
  }

  /** room:peek — read-only, does not seat the caller (unlike join()). */
  peek(roomId: string): RoomInfo {
    return this.snapshot(this.mustGet(roomId));
  }

  join(
    roomId: string,
    userId: string,
    nickname: string,
    seat?: SeatId,
    avatar?: string,
  ): RoomPlayer {
    const room = this.mustGet(roomId);
    const currentSeat = room.players.findIndex((player) => player?.userId === userId);
    if (currentSeat >= 0) {
      if (seat === undefined) {
        throw new RoomServiceError("ALREADY_IN_ROOM");
      }
      if (room.phase !== "waiting") {
        throw new RoomServiceError("GAME_IN_PROGRESS");
      }
      const player = room.players[currentSeat];
      if (!player) throw new RoomServiceError("NOT_IN_ROOM");
      if (seat === currentSeat) return player;
      if (room.players[seat] !== null) {
        throw new RoomServiceError("SEAT_TAKEN");
      }
      const wasReady = player.isReady;
      room.players[currentSeat] = null;
      player.seatId = seat;
      player.isReady = false;
      room.players[seat] = player;
      this.eventBus.emit("room:playerLeft", { roomId, seat: currentSeat as SeatId });
      if (wasReady) {
        this.eventBus.emit("room:readyChanged", {
          roomId,
          seat: currentSeat as SeatId,
          ready: false,
        });
      }
      this.eventBus.emit("room:playerJoined", {
        roomId,
        seat,
        nickname: player.nickname,
        isBot: player.isBot,
        ...(player.avatar ? { avatar: player.avatar } : {}),
      });
      return player;
    }
    return this.seatPlayer(room, userId, nickname, false, seat, avatar);
  }

  /**
   * room:leave. `waiting`: host (seat 0) leaving deletes the room outright
   * (evaluation point H doesn't apply pre-game — nobody's mid-hand yet);
   * anyone else leaving just frees their seat. `in-game`: same "mark
   * isAutoPiloted" path as a disconnect (评审点 H — leaving mid-game never
   * removes the seat or the room, only hands it to autoPlayBots). `finished`:
   * no-op, there's nothing left to leave.
   */
  leave(roomId: string, userId: string): void {
    const room = this.mustGet(roomId);
    const seat = room.players.findIndex((player) => player?.userId === userId);
    if (seat === -1) {
      throw new RoomServiceError("NOT_IN_ROOM");
    }

    if (room.phase === "in-game") {
      this.markAutoPiloted(room, userId);
      return;
    }
    if (room.phase === "finished") {
      return;
    }

    if (userId === room.ownerUserId) {
      this.untrackRoomPlayers(room);
      this.rooms.delete(roomId);
      this.eventBus.emit("room:closed", { roomId, reason: "hostLeft" });
      return;
    }
    room.players[seat] = null;
    this.playerRooms.delete(userId);
    this.eventBus.emit("room:playerLeft", { roomId, seat: seat as SeatId });
  }

  /**
   * Dual-purpose by design (docs/contracts/session-mechanics.md §6 "局间确认"):
   * pre-game this is the `waiting`-phase ready-up `canStart()` gates on; between
   * rounds it's reused as the confirm-to-continue gate `handleGameEnd` sets up
   * (`room.awaitingNextRound`) — same message, same field, no new protocol
   * surface. Only the latter case can trigger `nextRound` from here.
   */
  ready(roomId: string, userId: string, ready: boolean): void {
    const room = this.mustGet(roomId);
    this.mustFindPlayer(room, userId).isReady = ready;
    const seat = room.players.findIndex((player) => player?.userId === userId) as SeatId;
    this.eventBus.emit("room:readyChanged", { roomId, seat, ready });
    if (ready && room.awaitingNextRound && this.allReadyForNextRound(room)) {
      this.advanceToNextRound(room);
    }
  }

  canStart(room: Room): boolean {
    return room.phase === "waiting" && room.players.every((player) => player?.isReady === true);
  }

  start(roomId: string, requesterUserId?: string): Room {
    const room = this.mustGet(roomId);
    if (requesterUserId !== undefined) {
      if (requesterUserId !== room.ownerUserId) {
        throw new RoomServiceError("UNAUTHORIZED", "only the host can start the room");
      }
    }
    if (room.phase !== "waiting") {
      throw new RoomServiceError("GAME_IN_PROGRESS", "room already started");
    }
    if (!this.canStart(room)) {
      throw new RoomServiceError("INVALID_CONFIG", "room is not full and ready");
    }
    this.beginGame(room);
    this.autoPlayBots(room);
    return room;
  }

  nextRound(roomId: string): Room {
    const room = this.mustGet(roomId);
    room.dealer = this.gameService.computeNextDealer(room.gameState, room.dealer);
    this.beginGame(room, false);
    this.eventBus.emit("room:dealerChanged", {
      roomId,
      dealer: room.dealer,
      gameNumber: room.gameNumber,
    });
    this.emitSnapshots(room);
    this.autoPlayBots(room);
    return room;
  }

  /**
   * Only the host (seat 0, session-mechanics.md §6) may add a bot, and only
   * before the game starts — mirrors join()'s seat-filling but marks the
   * seat isBot and auto-readies it (a bot has no UI to click ready with).
   */
  addBot(roomId: string, requesterUserId: string, seat?: SeatId): RoomPlayer {
    const room = this.mustGet(roomId);
    if (requesterUserId !== room.ownerUserId) {
      throw new RoomServiceError("UNAUTHORIZED", "only the host can add a bot");
    }
    if (room.phase !== "waiting") {
      throw new RoomServiceError("GAME_IN_PROGRESS", "room already started");
    }
    const seatIndex = seat ?? room.players.findIndex((player) => player === null);
    if (seatIndex === -1) {
      throw new RoomServiceError("ROOM_FULL");
    }
    const player = this.seatPlayer(room, `bot:${randomUUID()}`, `AI-${seatIndex + 1}`, true, seat);
    this.ready(room.id, player.userId, true);
    return player;
  }

  removeBot(roomId: string, requesterUserId: string, seat: SeatId): void {
    const room = this.mustGet(roomId);
    if (!room.players[seat]?.isBot) {
      throw new RoomServiceError("NOT_IN_ROOM", "seat is not occupied by a bot");
    }
    this.removePlayer(roomId, requesterUserId, seat);
  }

  removePlayer(
    roomId: string,
    requesterUserId: string,
    seat: SeatId,
  ): { userId: string; isBot: boolean } {
    const room = this.mustGet(roomId);
    if (requesterUserId !== room.ownerUserId) {
      throw new RoomServiceError("UNAUTHORIZED", "only the host can remove a player");
    }
    if (room.phase !== "waiting") {
      throw new RoomServiceError("GAME_IN_PROGRESS", "room already started");
    }
    const player = room.players[seat];
    if (!player) throw new RoomServiceError("NOT_IN_ROOM", "seat is empty");
    if (player.userId === room.ownerUserId) {
      throw new RoomServiceError("UNAUTHORIZED", "the host cannot be removed");
    }
    room.players[seat] = null;
    if (!player.isBot) this.playerRooms.delete(player.userId);
    this.eventBus.emit("room:playerLeft", { roomId, seat });
    return { userId: player.userId, isBot: player.isBot };
  }

  applyPlayerAction(roomId: string, seat: SeatId, action: unknown): ApplyResult<unknown> {
    const room = this.mustGet(roomId);
    const result = this.runAction(room, seat, action);
    this.autoPlayBots(room);
    return result;
  }

  getAdvice(roomId: string, seat: SeatId): GameAdviceResponse {
    const room = this.mustGet(roomId);
    if (room.phase !== "in-game") {
      throw new RoomServiceError("GAME_NOT_STARTED", "no game in progress");
    }
    const view = this.gameService.getPlayerView(room.gameState, seat);
    if (!view) throw new RoomServiceError("NOT_IN_ROOM");
    const actions = [...this.gameService.getLegalActions(room.gameState, seat)];
    const recommended = recommendAction(view, actions);
    const recommendedActionIndex =
      recommended === undefined ? undefined : actions.indexOf(recommended);
    const deadline = this.claimDeadline(roomId, seat);
    return {
      seq: room.lastEventSeq,
      actions,
      ...(deadline !== undefined ? { deadline } : {}),
      ...(recommendedActionIndex !== undefined && recommendedActionIndex >= 0
        ? { recommendedActionIndex }
        : {}),
    };
  }

  /**
   * Applies a single seat's action and its side effects (score/event
   * broadcast/game-end handling); shared by real player actions and bot
   * actions driven from autoPlayBots. Does not itself trigger bot follow-up
   * — callers (applyPlayerAction/autoPlayBots) own that loop.
   */
  private runAction(room: Room, seat: SeatId, action: unknown): ApplyResult<unknown> {
    if (room.phase !== "in-game") {
      throw new RoomServiceError("GAME_NOT_STARTED", "no game in progress");
    }

    const result = this.gameService.applyAction(room.gameState, seat, action);
    if ("error" in result) {
      throw new RoomServiceError("ILLEGAL_ACTION", result.error.code);
    }

    room.gameState = result.state;
    this.trackEventSeq(room, result.events);
    room.currentGameEvents.push(...result.events);
    this.accumulateScores(room, this.extractScoreDeltas(result.events));
    const deadlines = this.reconcileClaimTimers(room);
    for (const event of result.events) {
      this.eventBus.emit("game:event", { roomId: room.id, event, deadlines });
    }
    this.emitSnapshots(room);

    if (result.events.some((event) => isGameEndedPayload(event.payload))) {
      this.handleGameEnd(room);
    }

    return result;
  }

  /**
   * Drives every bot seat's turn until none has a legal action left (i.e.
   * control has passed to a real player, or the room is no longer in-game).
   * Iterative, not recursive into applyPlayerAction, so a bot-heavy multi-
   * round session doesn't grow the call stack across rounds; re-reads
   * getLegalActions() fresh each step so it never acts on stale state.
   */
  private autoPlayBots(room: Room): void {
    const maxSteps = 2000;
    for (let step = 0; step < maxSteps && room.phase === "in-game"; step += 1) {
      const next = this.nextBotAction(room);
      if (!next) return;
      this.runAction(room, next.seat, next.action);
    }
  }

  private nextBotAction(room: Room): { seat: SeatId; action: unknown } | undefined {
    for (let seat = 0; seat < ROOM_SIZE; seat += 1) {
      const player = room.players[seat];
      if (!player?.isBot && !player?.isAutoPiloted) continue;
      const legalActions = this.gameService.getLegalActions(room.gameState, seat as SeatId);
      if (legalActions.length > 0) {
        return { seat: seat as SeatId, action: chooseAction(legalActions) };
      }
    }
    return undefined;
  }

  /**
   * Best-effort: called from the gateway's disconnect handler, which has no
   * ack to report a failure through, so this never throws — an unknown room
   * (already finished and cleaned up, or a stale socket) is simply a no-op.
   * Only affects seats mid-game (评审点 H is about leaving *during* a game);
   * a disconnect while still in the waiting lobby leaves the seat as-is.
   */
  handleDisconnect(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.phase !== "in-game") return;
    const player = room.players.find((candidate) => candidate?.userId === userId);
    if (!player || player.isBot || player.isAutoPiloted) return;
    const key = this.disconnectKey(roomId, userId);
    this.clearDisconnectTimer(key);
    player.isDisconnected = true;
    player.disconnectedAt = Date.now();
    this.eventBus.emit("room:playerDisconnected", { roomId, seat: player.seatId });
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(key);
      const current = this.rooms.get(roomId);
      const currentPlayer = current?.players.find((candidate) => candidate?.userId === userId);
      if (current && currentPlayer?.isDisconnected) this.markAutoPiloted(current, userId);
    }, this.configService.disconnectGraceMs);
    timer.unref();
    this.disconnectTimers.set(key, timer);
  }

  reconnect(
    roomId: string,
    userId: string,
  ): { seat: SeatId; view: PlayerViewBase; seq: number; deadline?: number } | undefined {
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== "in-game") return undefined;
    const player = room.players.find((candidate) => candidate?.userId === userId);
    if (!player?.isDisconnected || player.isAutoPiloted) return undefined;
    this.clearDisconnectTimer(this.disconnectKey(roomId, userId));
    player.isDisconnected = false;
    delete player.disconnectedAt;
    this.eventBus.emit("room:playerReconnected", { roomId, seat: player.seatId });
    const view = this.gameService.getPlayerView(room.gameState, player.seatId);
    if (!view) return undefined;
    const deadline = this.claimDeadline(roomId, player.seatId);
    return {
      seat: player.seatId,
      view,
      seq: room.lastEventSeq,
      ...(deadline !== undefined ? { deadline } : {}),
    };
  }

  /**
   * Shared by handleDisconnect (socket dropped) and leave()'s in-game branch
   * (still connected, deliberately leaving) — both reduce to the same thing:
   * this seat is no longer under real control, autoPlayBots takes it from
   * here. If that was the last human seat left in the room, there's nobody
   * to keep the game running for, so it stops instead of playing itself out
   * to nobody.
   */
  private markAutoPiloted(room: Room, userId: string): void {
    if (room.phase !== "in-game") return;
    const player = room.players.find((candidate) => candidate?.userId === userId);
    if (!player || player.isBot) return;
    this.clearDisconnectTimer(this.disconnectKey(room.id, userId));
    player.isDisconnected = false;
    delete player.disconnectedAt;
    if (player.isAutoPiloted) return;
    player.isAutoPiloted = true;
    this.clearClaimTimer(room.id, player.seatId);
    this.eventBus.emit("room:playerAutoPiloted", { roomId: room.id, seat: player.seatId });
    if (this.hasNoHumanLeft(room)) {
      this.closeAbandonedRoom(room);
      return;
    }
    // Newly-autopiloted seats auto-confirm the pending "next round?" gate too
    // (§6), same as a bot — it must never be the reason nobody can continue.
    if (room.awaitingNextRound && !player.isReady) {
      player.isReady = true;
      this.eventBus.emit("room:readyChanged", {
        roomId: room.id,
        seat: player.seatId,
        ready: true,
      });
      if (this.allReadyForNextRound(room)) {
        this.advanceToNextRound(room);
        return;
      }
    }
    this.autoPlayBots(room);
  }

  private hasNoHumanLeft(room: Room): boolean {
    return !room.players.some((player) => player && !player.isBot && !player.isAutoPiloted);
  }

  private disconnectKey(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
  }

  private clearDisconnectTimer(key: string): void {
    const timer = this.disconnectTimers.get(key);
    if (timer) clearTimeout(timer);
    this.disconnectTimers.delete(key);
  }

  private closeAbandonedRoom(room: Room): void {
    this.clearRoomClaimTimers(room.id);
    room.phase = "finished";
    room.status = "closed";
    room.finishedAt = Date.now();
    this.untrackRoomPlayers(room);
    this.eventBus.emit("room:closed", { roomId: room.id, reason: "allPlayersLeft" });
  }

  accumulateScores(room: Room, scoreDeltas: readonly [number, number, number, number]): void {
    room.scores = [
      room.scores[0] + scoreDeltas[0],
      room.scores[1] + scoreDeltas[1],
      room.scores[2] + scoreDeltas[2],
      room.scores[3] + scoreDeltas[3],
    ];
  }

  shouldContinue(room: Room): boolean {
    if (room.sessionFormat === "best-of-3") {
      // TODO(server): best-of-3 termination (first to 2 wins) is not implemented yet.
      return false;
    }
    return room.gameNumber < (room.totalGames ?? DEFAULT_TOTAL_GAMES);
  }

  computeRanking(room: Room): RankingEntry[] {
    return room.scores
      .map((score, seatId) => ({ seatId: seatId as SeatId, score }))
      .sort((a, b) => b.score - a.score);
  }

  snapshot(room: Room): RoomInfo {
    return {
      id: room.id,
      name: room.name,
      ownerUserId: room.ownerUserId,
      owner: room.ownerNickname,
      rulesetId: room.rulesetId,
      config: room.config,
      sessionFormat: room.sessionFormat,
      phase: room.phase,
      status: room.status,
      players: room.players.map((player) =>
        player
          ? {
              userId: player.userId,
              seatId: player.seatId,
              nickname: player.nickname,
              isBot: player.isBot,
              isReady: player.isReady,
              isAutoPiloted: player.isAutoPiloted,
              isDisconnected: player.isDisconnected,
              ...(player.avatar ? { avatar: player.avatar } : {}),
            }
          : null,
      ) as RoomInfo["players"],
      scores: room.scores,
      gameNumber: room.gameNumber,
      totalGames: room.totalGames,
      wins: room.wins,
      dealer: room.dealer,
      createdAt: room.createdAt,
      finishedAt: room.finishedAt,
      result: room.result,
    };
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  findActiveRoomForUser(userId: string): string | undefined {
    return this.playerRooms.get(userId);
  }

  private untrackRoomPlayers(room: Room): void {
    for (const player of room.players) {
      if (player && !player.isBot) this.playerRooms.delete(player.userId);
    }
  }

  /**
   * Dev/test-only escape hatch (decisions.md D19) — gate/membership check is
   * the caller's (RoomsGateway) responsibility.
   */
  getOmniscientView(roomId: string): OmniscientView {
    const room = this.mustGet(roomId);
    if (room.phase !== "in-game") {
      throw new RoomServiceError("GAME_NOT_STARTED", "no game in progress");
    }
    return this.gameService.getOmniscientView(room.gameState);
  }

  /**
   * In-memory miss only ever means "server restarted since" (rooms are
   * never evicted while the process is up) — falls back to the PG archive.
   * See contracts/session-mechanics.md §11.
   */
  private async findArchivedGame(
    roomId: string,
    gameNumber: number,
  ): Promise<{ rulesetId: string; log: FinishedGameLog } | null> {
    const room = this.rooms.get(roomId);
    if (room) {
      const log = room.finishedGames.find((entry) => entry.gameNumber === gameNumber);
      return log ? { rulesetId: room.rulesetId, log } : null;
    }
    const archived = await this.persistenceService.findGame(roomId, gameNumber);
    if (!archived) return null;
    const { rulesetId, ...log } = archived;
    return { rulesetId, log };
  }

  /**
   * Real product feature (unlike getOmniscientView): any userId seated in
   * that archived game may fetch it, regardless of current room membership.
   */
  async getReplay(
    roomId: string,
    gameNumber: number,
    userId: string,
  ): Promise<{ gameNumber: number; finalView: PlayerViewBase; events: GameEvent[] }> {
    const found = await this.findArchivedGame(roomId, gameNumber);
    if (!found) throw new RoomServiceError("GAME_NOT_FOUND");
    const { rulesetId, log } = found;
    const seat = log.seatUserIds.findIndex((seatUserId) => seatUserId === userId);
    if (seat === -1) throw new RoomServiceError("UNAUTHORIZED");
    const finalView = this.gameService.rebuildPlayerView(rulesetId, log.events, seat as SeatId);
    if (!finalView) throw new RoomServiceError("INTERNAL");
    return { gameNumber, finalView, events: eventsVisibleTo(log.events, seat as SeatId) };
  }

  /**
   * Dev/test-only escape hatch (D19), gated like getOmniscientView — unlike
   * getReplay above. End-of-game only: feeds the archived finalState
   * straight into getOmniscientView instead of reconstructing from events.
   */
  async getReplayOmniscientView(roomId: string, gameNumber: number): Promise<OmniscientView> {
    const found = await this.findArchivedGame(roomId, gameNumber);
    if (!found) throw new RoomServiceError("GAME_NOT_FOUND");
    return this.gameService.getOmniscientView(found.log.finalState);
  }

  private beginGame(room: Room, emitInitialSnapshots = true): void {
    this.clearRoomClaimTimers(room.id);
    room.gameNumber += 1;
    room.seed = randomInt(MAX_SEED);
    const result = this.gameService.createGame(room.config, room.seed, room.dealer);
    if ("error" in result) {
      throw new RoomServiceError("INVALID_CONFIG", result.error.code);
    }

    room.gameState = result.state;
    room.phase = "in-game";
    room.lastEventSeq = 0;
    this.trackEventSeq(room, result.events);
    // phase 4.5: seed the archive with createGame's own events
    // (GameStarted etc.) — those are never re-broadcast as game:event, so
    // rebuildPlayerView's expected starting point would be missing otherwise.
    room.currentGameEvents = [...result.events];
    room.currentGameSeatUserIds = room.players.map((player) => player?.userId ?? null) as [
      string | null,
      string | null,
      string | null,
      string | null,
    ];

    if (emitInitialSnapshots) this.emitSnapshots(room);
  }

  private emitSnapshots(room: Room): void {
    for (let seat = 0; seat < ROOM_SIZE; seat++) {
      const view = this.gameService.getPlayerView(room.gameState, seat as SeatId);
      if (!view) continue;
      const deadline = this.claimDeadline(room.id, seat as SeatId);
      this.eventBus.emit("game:snapshot", {
        roomId: room.id,
        seat: seat as SeatId,
        view,
        seq: room.lastEventSeq,
        ...(deadline !== undefined ? { deadline } : {}),
      });
    }
  }

  private handleGameEnd(room: Room): void {
    this.clearRoomClaimTimers(room.id);
    const gameLog: FinishedGameLog = {
      gameNumber: room.gameNumber,
      seatUserIds: room.currentGameSeatUserIds,
      events: room.currentGameEvents,
      finalState: room.gameState,
    };
    room.finishedGames.push(gameLog);
    // Fire-and-forget: archival must never be able to interrupt this
    // synchronous game-processing flow (decisions.md phase 5 entry).
    this.persistenceService.fireAndForget(
      this.persistenceService.archiveGame(room.id, { ...gameLog, rulesetId: room.rulesetId }),
      `archiveGame(${room.id}, ${gameLog.gameNumber})`,
    );

    this.eventBus.emit("room:scoreUpdated", {
      roomId: room.id,
      scores: room.scores,
      gameNumber: room.gameNumber,
      totalGames: room.totalGames,
    });

    if (!this.shouldContinue(room)) {
      const ranking = this.computeRanking(room);
      room.phase = "finished";
      room.status = "closed";
      room.finishedAt = Date.now();
      this.untrackRoomPlayers(room);
      room.result = {
        winner: ranking[0]!.seatId,
        ranking,
        format: room.sessionFormat,
        gamesPlayed: room.gameNumber,
      };
      this.persistenceService.fireAndForget(
        this.persistenceService.archiveSession(room.id, {
          rulesetId: room.rulesetId,
          sessionFormat: room.sessionFormat,
          result: room.result,
          finishedAt: room.finishedAt,
        }),
        `archiveSession(${room.id})`,
      );
      this.eventBus.emit("room:sessionFinished", { roomId: room.id, result: room.result });
      return;
    }

    // docs/contracts/session-mechanics.md §6 "局间确认": wait for every real
    // seat to confirm (reusing room:ready/isReady) instead of dealing the
    // next round immediately. Bot/autopiloted seats auto-confirm so they
    // never block; if that already covers every seat (e.g. no humans left,
    // or everyone happened to already be ready), advance right away.
    room.awaitingNextRound = true;
    for (const player of room.players) {
      if (!player) continue;
      player.isReady = player.isBot || player.isAutoPiloted;
      this.eventBus.emit("room:readyChanged", {
        roomId: room.id,
        seat: player.seatId,
        ready: player.isReady,
      });
    }
    if (this.allReadyForNextRound(room)) {
      this.advanceToNextRound(room);
    }
  }

  private allReadyForNextRound(room: Room): boolean {
    return room.players.every((player) => player === null || player.isReady);
  }

  private advanceToNextRound(room: Room): void {
    room.awaitingNextRound = false;
    this.nextRound(room.id);
  }

  private trackEventSeq(room: Room, events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.seq > room.lastEventSeq) room.lastEventSeq = event.seq;
    }
  }

  private reconcileClaimTimers(room: Room): Partial<Record<SeatId, number>> {
    const deadlines: Partial<Record<SeatId, number>> = {};
    for (let seat = 0; seat < ROOM_SIZE; seat += 1) {
      const seatId = seat as SeatId;
      const player = room.players[seatId];
      const canTimedPass =
        room.phase === "in-game" &&
        !!player &&
        !player.isBot &&
        !player.isAutoPiloted &&
        this.gameService
          .getLegalActions(room.gameState, seatId)
          .some((action) => isRecord(action) && action.type === "pass");
      if (!canTimedPass) {
        this.clearClaimTimer(room.id, seatId);
        continue;
      }

      const key = this.claimKey(room.id, seatId);
      let entry = this.claimTimers.get(key);
      if (!entry) {
        const timeoutMs = this.configService.claimTimeoutMs;
        const deadline = Date.now() + timeoutMs;
        const timer = setTimeout(
          () => this.handleClaimTimeout(room.id, seatId, deadline),
          timeoutMs,
        );
        timer.unref();
        entry = { deadline, timer };
        this.claimTimers.set(key, entry);
      }
      deadlines[seatId] = entry.deadline;
    }
    return deadlines;
  }

  private handleClaimTimeout(roomId: string, seat: SeatId, deadline: number): void {
    const key = this.claimKey(roomId, seat);
    const entry = this.claimTimers.get(key);
    if (!entry || entry.deadline !== deadline) return;
    this.claimTimers.delete(key);
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== "in-game") return;
    const canPass = this.gameService
      .getLegalActions(room.gameState, seat)
      .some((action) => isRecord(action) && action.type === "pass");
    if (!canPass) return;
    this.runAction(room, seat, { type: "pass" });
    this.autoPlayBots(room);
  }

  private claimKey(roomId: string, seat: SeatId): string {
    return `${roomId}:${seat}`;
  }

  private claimDeadline(roomId: string, seat: SeatId): number | undefined {
    return this.claimTimers.get(this.claimKey(roomId, seat))?.deadline;
  }

  private clearClaimTimer(roomId: string, seat: SeatId): void {
    const key = this.claimKey(roomId, seat);
    const entry = this.claimTimers.get(key);
    if (entry) clearTimeout(entry.timer);
    this.claimTimers.delete(key);
  }

  private clearRoomClaimTimers(roomId: string): void {
    for (let seat = 0; seat < ROOM_SIZE; seat += 1) {
      this.clearClaimTimer(roomId, seat as SeatId);
    }
  }

  private extractScoreDeltas(events: readonly GameEvent[]): [number, number, number, number] {
    let deltas: [number, number, number, number] = [0, 0, 0, 0];
    for (const event of events) {
      if (isSettledPayload(event.payload)) {
        const [d0, d1, d2, d3] = event.payload.scoreDeltas;
        deltas = [deltas[0] + d0, deltas[1] + d1, deltas[2] + d2, deltas[3] + d3];
      }
    }
    return deltas;
  }

  /** `seat` given = must be that exact empty seat (SEAT_TAKEN otherwise); omitted = first empty seat (ROOM_FULL if none). */
  private seatPlayer(
    room: Room,
    userId: string,
    nickname: string,
    isBot = false,
    seat?: SeatId,
    avatar?: string,
  ): RoomPlayer {
    const seatIndex = seat ?? room.players.findIndex((player) => player === null);
    if (seatIndex === -1) {
      throw new RoomServiceError("ROOM_FULL");
    }
    if (room.players[seatIndex] !== null) {
      throw new RoomServiceError("SEAT_TAKEN");
    }
    const player: RoomPlayer = {
      userId,
      seatId: seatIndex as SeatId,
      nickname,
      ...(avatar ? { avatar } : {}),
      isBot,
      isReady: false,
      isAutoPiloted: false,
      isDisconnected: false,
    };
    room.players[seatIndex] = player;
    if (!isBot) this.playerRooms.set(userId, room.id);
    this.eventBus.emit("room:playerJoined", {
      roomId: room.id,
      seat: player.seatId,
      nickname,
      isBot,
      ...(player.avatar ? { avatar: player.avatar } : {}),
    });
    return player;
  }

  private mustGet(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomServiceError("ROOM_NOT_FOUND");
    return room;
  }

  private mustFindPlayer(room: Room, userId: string): RoomPlayer {
    const player = room.players.find((candidate) => candidate?.userId === userId);
    if (!player) throw new RoomServiceError("NOT_IN_ROOM");
    return player;
  }
}
