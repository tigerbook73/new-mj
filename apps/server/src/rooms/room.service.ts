import { randomInt, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { chooseAction } from "@new-mj/ai";
import type { ApplyResult, GameConfig, GameEvent, OmniscientView, SeatId } from "@new-mj/core";
import type { RankingEntry, RoomInfo, RoomSummary, SessionFormat } from "@new-mj/protocol";
import { GameService } from "../core/game.service";
import { EventBus } from "./event-bus";
import type { Room, RoomPlayer } from "./room";
import { RoomServiceError } from "./room-service.error";

const ROOM_SIZE = 4;
const DEFAULT_TOTAL_GAMES = 4;
const MAX_SEED = 2 ** 31;

interface SettledPayload {
  type: "Settled";
  scoreDeltas: [number, number, number, number];
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

  constructor(
    private readonly gameService: GameService,
    private readonly eventBus: EventBus,
  ) {}

  create(
    hostUserId: string,
    hostNickname: string,
    rulesetId: string,
    config: GameConfig,
    sessionFormat: SessionFormat = "4-round",
    name?: string,
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
      createdAt: Date.now(),
      currentGameEvents: [],
      currentGameSeatUserIds: [null, null, null, null],
      finishedGames: [],
    };
    this.rooms.set(room.id, room);
    this.seatPlayer(room, hostUserId, hostNickname);
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

  join(roomId: string, userId: string, nickname: string, seat?: SeatId): RoomPlayer {
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
      });
      return player;
    }
    return this.seatPlayer(room, userId, nickname, false, seat);
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
      this.rooms.delete(roomId);
      this.eventBus.emit("room:closed", { roomId, reason: "hostLeft" });
      return;
    }
    room.players[seat] = null;
    this.eventBus.emit("room:playerLeft", { roomId, seat: seat as SeatId });
  }

  ready(roomId: string, userId: string, ready: boolean): void {
    const room = this.mustGet(roomId);
    this.mustFindPlayer(room, userId).isReady = ready;
    const seat = room.players.findIndex((player) => player?.userId === userId) as SeatId;
    this.eventBus.emit("room:readyChanged", { roomId, seat, ready });
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
    this.beginGame(room);
    this.eventBus.emit("room:dealerChanged", {
      roomId,
      dealer: room.dealer,
      gameNumber: room.gameNumber,
    });
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
    this.eventBus.emit("room:playerLeft", { roomId, seat });
    return { userId: player.userId, isBot: player.isBot };
  }

  applyPlayerAction(roomId: string, seat: SeatId, action: unknown): ApplyResult<unknown> {
    const room = this.mustGet(roomId);
    const result = this.runAction(room, seat, action);
    this.autoPlayBots(room);
    return result;
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
    for (const event of result.events) {
      this.eventBus.emit("game:event", { roomId: room.id, event });
    }

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
    this.markAutoPiloted(room, userId);
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
    player.isAutoPiloted = true;
    if (this.hasNoHumanLeft(room)) {
      this.closeAbandonedRoom(room);
      return;
    }
    this.autoPlayBots(room);
  }

  private hasNoHumanLeft(room: Room): boolean {
    return !room.players.some((player) => player && !player.isBot && !player.isAutoPiloted);
  }

  private closeAbandonedRoom(room: Room): void {
    room.phase = "finished";
    room.status = "closed";
    room.finishedAt = Date.now();
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

  /**
   * Dev/test-only escape hatch (decisions.md D19) — caller (RoomsGateway) is
   * responsible for the `ALLOW_DEBUG_OMNISCIENT` gate and for validating the
   * requester is a seated player in this room; this method only checks the
   * room itself is in a state where a gameState exists.
   */
  getOmniscientView(roomId: string): OmniscientView {
    const room = this.mustGet(roomId);
    if (room.phase !== "in-game") {
      throw new RoomServiceError("GAME_NOT_STARTED", "no game in progress");
    }
    return this.gameService.getOmniscientView(room.gameState);
  }

  private beginGame(room: Room): void {
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
    // phase-4.5-replay.md: seed the archive with createGame's own events
    // (GameStarted etc.) — those are never re-broadcast as game:event, so
    // rebuildPlayerView's expected starting point would be missing otherwise.
    room.currentGameEvents = [...result.events];
    room.currentGameSeatUserIds = room.players.map((player) => player?.userId ?? null) as [
      string | null,
      string | null,
      string | null,
      string | null,
    ];

    for (let seat = 0; seat < ROOM_SIZE; seat++) {
      const view = this.gameService.getPlayerView(room.gameState, seat as SeatId);
      if (!view) continue;
      this.eventBus.emit("game:snapshot", {
        roomId: room.id,
        seat: seat as SeatId,
        view,
        seq: room.lastEventSeq,
      });
    }
  }

  private handleGameEnd(room: Room): void {
    room.finishedGames.push({
      gameNumber: room.gameNumber,
      seatUserIds: room.currentGameSeatUserIds,
      events: room.currentGameEvents,
    });

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
      room.result = {
        winner: ranking[0]!.seatId,
        ranking,
        format: room.sessionFormat,
        gamesPlayed: room.gameNumber,
      };
      this.eventBus.emit("room:sessionFinished", { roomId: room.id, result: room.result });
      return;
    }

    this.nextRound(room.id);
  }

  private trackEventSeq(room: Room, events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.seq > room.lastEventSeq) room.lastEventSeq = event.seq;
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
      isBot,
      isReady: false,
      isAutoPiloted: false,
    };
    room.players[seatIndex] = player;
    this.eventBus.emit("room:playerJoined", {
      roomId: room.id,
      seat: player.seatId,
      nickname,
      isBot,
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
