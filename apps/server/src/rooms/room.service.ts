import { randomInt, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { ApplyResult, GameConfig, GameEvent, SeatId } from "@new-mj/core";
import type { RankingEntry, RoomInfo, SessionFormat } from "@new-mj/protocol";
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
  ): Room {
    const room: Room = {
      id: randomUUID(),
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
    };
    this.rooms.set(room.id, room);
    this.seatPlayer(room, hostUserId, hostNickname);
    return room;
  }

  join(roomId: string, userId: string, nickname: string): RoomPlayer {
    const room = this.mustGet(roomId);
    if (room.players.some((player) => player?.userId === userId)) {
      throw new RoomServiceError("ALREADY_IN_ROOM");
    }
    return this.seatPlayer(room, userId, nickname);
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

  start(roomId: string): Room {
    const room = this.mustGet(roomId);
    if (room.phase !== "waiting") {
      throw new RoomServiceError("GAME_IN_PROGRESS", "room already started");
    }
    if (!this.canStart(room)) {
      throw new RoomServiceError("INVALID_CONFIG", "room is not full and ready");
    }
    this.beginGame(room);
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
    return room;
  }

  applyPlayerAction(roomId: string, seat: SeatId, action: unknown): ApplyResult<unknown> {
    const room = this.mustGet(roomId);
    if (room.phase !== "in-game") {
      throw new RoomServiceError("GAME_NOT_STARTED", "no game in progress");
    }

    const result = this.gameService.applyAction(room.gameState, seat, action);
    if ("error" in result) {
      throw new RoomServiceError("ILLEGAL_ACTION", result.error.code);
    }

    room.gameState = result.state;
    this.trackEventSeq(room, result.events);
    this.accumulateScores(room, this.extractScoreDeltas(result.events));
    for (const event of result.events) {
      this.eventBus.emit("game:event", { roomId, event });
    }

    if (result.events.some((event) => isGameEndedPayload(event.payload))) {
      this.handleGameEnd(room);
    }

    return result;
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

  private seatPlayer(room: Room, userId: string, nickname: string): RoomPlayer {
    const seat = room.players.findIndex((player) => player === null);
    if (seat === -1) {
      throw new RoomServiceError("ROOM_FULL");
    }
    const player: RoomPlayer = {
      userId,
      seatId: seat as SeatId,
      nickname,
      isBot: false,
      isReady: false,
    };
    room.players[seat] = player;
    this.eventBus.emit("room:playerJoined", {
      roomId: room.id,
      seat: player.seatId,
      nickname,
      isBot: false,
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
