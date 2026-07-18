import { playJunkGame } from "@new-mj/core";
import { GameService } from "../core/game.service";
// GameService is used directly (not via RoomService) so the acceptance test
// below can inspect legal actions without exposing gameService as public API.
import type { PersistenceService } from "../persistence/persistence.service";
import { EventBus } from "./event-bus";
import type { Room } from "./room";
import { RoomServiceError } from "./room-service.error";
import { RoomService } from "./room.service";

// RoomService only ever fire-and-forgets through this — no real DB needed
// for these in-memory-behavior tests (persistence read/write itself is
// covered separately, against a real local Postgres).
const fakePersistenceService = (): PersistenceService =>
  ({
    archiveGame: async () => undefined,
    archiveSession: async () => undefined,
    findGame: async () => null,
    findSession: async () => null,
    upsertProfile: async () => undefined,
    findProfile: async () => null,
    fireAndForget: () => undefined,
  }) as unknown as PersistenceService;

const makeRoom = (overrides: Partial<Room> = {}): Room => ({
  id: "room-1",
  name: "Test Room",
  ownerUserId: "host",
  ownerNickname: "Host",
  rulesetId: "junk",
  config: { rulesetId: "junk" },
  sessionFormat: "4-round",
  phase: "waiting",
  status: "open",
  players: [null, null, null, null],
  scores: [0, 0, 0, 0],
  gameNumber: 1,
  totalGames: 4,
  dealer: 0,
  seed: 1,
  lastEventSeq: 0,
  createdAt: Date.now(),
  currentGameEvents: [],
  currentGameSeatUserIds: [null, null, null, null],
  finishedGames: [],
  ...overrides,
});

const newRoomService = () =>
  new RoomService(new GameService(), new EventBus(), fakePersistenceService());

describe("RoomService — pure helpers", () => {
  it("accumulateScores adds deltas seat-wise across multiple calls", () => {
    const service = newRoomService();
    const room = makeRoom();

    service.accumulateScores(room, [100, -30, -40, -30]);
    expect(room.scores).toEqual([100, -30, -40, -30]);

    service.accumulateScores(room, [50, 0, 25, -75]);
    expect(room.scores).toEqual([150, -30, -15, -105]);
  });

  it("shouldContinue is true until gameNumber reaches totalGames for 4-round", () => {
    const service = newRoomService();
    expect(service.shouldContinue(makeRoom({ gameNumber: 3, totalGames: 4 }))).toBe(true);
    expect(service.shouldContinue(makeRoom({ gameNumber: 4, totalGames: 4 }))).toBe(false);
  });

  it("shouldContinue is always false for best-of-3 (not implemented yet)", () => {
    const service = newRoomService();
    expect(service.shouldContinue(makeRoom({ sessionFormat: "best-of-3", gameNumber: 1 }))).toBe(
      false,
    );
  });

  it("computeRanking sorts seats by score descending", () => {
    const service = newRoomService();
    const room = makeRoom({ scores: [-10, 40, 5, 5] });
    expect(service.computeRanking(room)).toEqual([
      { seatId: 1, score: 40 },
      { seatId: 2, score: 5 },
      { seatId: 3, score: 5 },
      { seatId: 0, score: -10 },
    ]);
  });
});

describe("RoomService — lifecycle", () => {
  it("create seats the host at seat 0 and returns a waiting room", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });

    expect(room.phase).toBe("waiting");
    expect(room.players[0]).toMatchObject({ userId: "host", seatId: 0, isReady: false });
    expect(service.get(room.id)).toBe(room);
  });

  it("join seats subsequent players and rejects duplicates / full rooms", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });

    service.join(room.id, "p2", "P2");
    service.join(room.id, "p3", "P3");
    service.join(room.id, "p4", "P4");
    expect(room.players.map((p) => p?.userId)).toEqual(["host", "p2", "p3", "p4"]);

    expect(() => service.join(room.id, "host", "Host")).toThrow(RoomServiceError);
    expect(() => service.join(room.id, "p5", "P5")).toThrow(RoomServiceError);
  });

  it("join/ready on an unknown room throws ROOM_NOT_FOUND", () => {
    const service = newRoomService();
    expect(() => service.join("no-such-room", "p1", "P1")).toThrow(
      expect.objectContaining({ code: "ROOM_NOT_FOUND" }),
    );
  });

  it("create defaults the room name from the host nickname when omitted", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    expect(room.name).toBe("Host's room");
  });

  it("create uses an explicit name when given", () => {
    const service = newRoomService();
    const room = service.create(
      "host",
      "Host",
      "junk",
      { rulesetId: "junk" },
      "4-round",
      "Fun room",
    );
    expect(room.name).toBe("Fun room");
  });

  it("join seats a player at an explicitly requested seat", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });

    const player = service.join(room.id, "p2", "P2", 3);

    expect(player.seatId).toBe(3);
    expect(room.players[3]).toMatchObject({ userId: "p2" });
    expect(room.players[1]).toBeNull();
  });

  it("join rejects an already-occupied explicit seat with SEAT_TAKEN", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });

    expect(() => service.join(room.id, "p2", "P2", 0)).toThrow(
      expect.objectContaining({ code: "SEAT_TAKEN" }),
    );
  });

  it("start requires all four seats filled and ready", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.join(room.id, "p2", "P2");
    service.join(room.id, "p3", "P3");
    service.join(room.id, "p4", "P4");

    expect(() => service.start(room.id)).toThrow(
      expect.objectContaining({ code: "INVALID_CONFIG" }),
    );

    for (const userId of ["host", "p2", "p3", "p4"]) {
      service.ready(room.id, userId, true);
    }
    service.start(room.id);

    expect(room.phase).toBe("in-game");
    expect(room.gameState).toBeDefined();
  });

  it("start twice throws GAME_IN_PROGRESS", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);

    expect(() => service.start(room.id)).toThrow(
      expect.objectContaining({ code: "GAME_IN_PROGRESS" }),
    );
  });

  it("applyPlayerAction on a room with no game running throws GAME_NOT_STARTED", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });

    expect(() => service.applyPlayerAction(room.id, 0, { type: "discard", tile: 0 })).toThrow(
      expect.objectContaining({ code: "GAME_NOT_STARTED" }),
    );
  });
});

describe("RoomService — addBot", () => {
  it("seats a ready bot into the next empty seat when the host asks", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });

    const bot = service.addBot(room.id, "host");

    expect(bot.seatId).toBe(1);
    expect(room.players[1]).toMatchObject({ isBot: true, isReady: true });
  });

  it("rejects a non-host requester", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.join(room.id, "p2", "P2");

    expect(() => service.addBot(room.id, "p2")).toThrow(
      expect.objectContaining({ code: "UNAUTHORIZED" }),
    );
  });

  it("rejects once the room is full", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");

    expect(() => service.addBot(room.id, "host")).toThrow(
      expect.objectContaining({ code: "ROOM_FULL" }),
    );
  });

  it("rejects once the game has started", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.ready(room.id, "host", true);
    service.start(room.id);

    expect(() => service.addBot(room.id, "host")).toThrow(
      expect.objectContaining({ code: "GAME_IN_PROGRESS" }),
    );
  });

  it("seats a bot at an explicitly requested seat", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });

    const bot = service.addBot(room.id, "host", 2);

    expect(bot.seatId).toBe(2);
    expect(room.players[1]).toBeNull();
    expect(room.players[2]).toMatchObject({ isBot: true, nickname: "AI-3" });
  });

  it("rejects an explicitly requested seat that's already taken", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });

    expect(() => service.addBot(room.id, "host", 0)).toThrow(
      expect.objectContaining({ code: "SEAT_TAKEN" }),
    );
  });
});

describe("RoomService — list/peek", () => {
  it("list only returns waiting+open rooms for the requested ruleset", () => {
    const service = newRoomService();
    const waiting = service.create("host", "Host", "junk", { rulesetId: "junk" }, "4-round", "A");
    service.create("host2", "Host2", "bloodbattle", { rulesetId: "bloodbattle" }, "4-round", "B");
    const finished = service.create(
      "host3",
      "Host3",
      "junk",
      { rulesetId: "junk" },
      "4-round",
      "C",
    );
    finished.phase = "finished";
    finished.status = "closed";

    const results = service.list("junk");

    expect(results.map((room) => room.id)).toEqual([waiting.id]);
    expect(results[0]).toMatchObject({ name: "A", playerCount: 1, status: "open" });
  });

  it("list filters by a case-insensitive substring of the room name", () => {
    const service = newRoomService();
    service.create("host", "Host", "junk", { rulesetId: "junk" }, "4-round", "Alice's Table");
    service.create("host2", "Host2", "junk", { rulesetId: "junk" }, "4-round", "Bob's Table");

    expect(service.list("junk", "alice").map((room) => room.name)).toEqual(["Alice's Table"]);
    expect(service.list("junk", "table")).toHaveLength(2);
    expect(service.list("junk", "nonexistent")).toHaveLength(0);
  });

  it("peek returns the room snapshot without seating the caller", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });

    const info = service.peek(room.id);

    expect(info.id).toBe(room.id);
    expect(room.players.filter((player) => player !== null)).toHaveLength(1);
  });

  it("peek on an unknown room throws ROOM_NOT_FOUND", () => {
    const service = newRoomService();
    expect(() => service.peek("no-such-room")).toThrow(
      expect.objectContaining({ code: "ROOM_NOT_FOUND" }),
    );
  });
});

describe("RoomService — leave (phase 4.4.4)", () => {
  it("throws NOT_IN_ROOM for a caller who isn't seated", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    expect(() => service.leave(room.id, "stranger")).toThrow(
      expect.objectContaining({ code: "NOT_IN_ROOM" }),
    );
  });

  it("waiting phase: a non-host leaving just frees their seat", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.join(room.id, "p2", "P2");

    service.leave(room.id, "p2");

    expect(room.players[1]).toBeNull();
    expect(service.get(room.id)).toBeDefined();
  });

  it("waiting phase: the host leaving deletes the room", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.join(room.id, "p2", "P2");

    service.leave(room.id, "host");

    expect(service.get(room.id)).toBeUndefined();
  });

  it("in-game phase: leaving marks the seat auto-piloted, same as a disconnect", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);

    service.leave(room.id, "p2");

    expect(room.players[1]).toMatchObject({ userId: "p2", isAutoPiloted: true });
    expect(service.get(room.id)).toBeDefined();
    expect(room.phase).toBe("in-game");
  });

  it("in-game phase: once every seat is bot/auto-piloted, the room stops and closes", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.ready(room.id, "host", true);
    service.start(room.id);
    expect(room.phase).toBe("in-game");

    service.leave(room.id, "host");

    expect(room.phase).toBe("finished");
    expect(room.status).toBe("closed");
    expect(room.finishedAt).toBeDefined();
  });

  it("finished phase is a no-op", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    room.phase = "finished";

    expect(() => service.leave(room.id, "host")).not.toThrow();
    expect(room.players[0]).not.toBeNull();
  });
});

describe("RoomService — bot auto-play (phase 4 acceptance criterion)", () => {
  it("a single human plus 3 bots plays a complete junk session", () => {
    const service = newRoomService();
    const gameService = new GameService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    expect(room.players.filter((player) => player?.isBot)).toHaveLength(3);
    expect(room.players[0]?.isReady).toBe(false);

    service.ready(room.id, "host", true);
    service.start(room.id);

    // start()/applyPlayerAction() auto-play every bot seat, so once control
    // returns here it must be the human's (seat 0) turn — this loop only
    // ever supplies seat-0 actions.
    let steps = 0;
    while (room.phase === "in-game" && steps < 500) {
      steps += 1;
      const legalActions = gameService.getLegalActions(room.gameState, 0);
      expect(legalActions.length).toBeGreaterThan(0);
      service.applyPlayerAction(room.id, 0, legalActions[0]);
    }

    expect(room.phase).toBe("finished");
    expect(room.result?.gamesPlayed).toBe(4);
  });
});

describe("RoomService — replay log archiving (phase 4.5 step 1)", () => {
  it("archives one FinishedGameLog per game, seeded with createGame's own events", () => {
    const service = newRoomService();
    const gameService = new GameService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    const expectedSeatUserIds = room.players.map((player) => player?.userId ?? null);

    service.ready(room.id, "host", true);
    service.start(room.id);

    let steps = 0;
    while (room.phase === "in-game" && steps < 500) {
      steps += 1;
      const legalActions = gameService.getLegalActions(room.gameState, 0);
      service.applyPlayerAction(room.id, 0, legalActions[0]);
    }

    expect(room.phase).toBe("finished");
    expect(room.finishedGames).toHaveLength(4);
    room.finishedGames.forEach((log, index) => {
      expect(log.gameNumber).toBe(index + 1);
      expect(log.seatUserIds).toEqual(expectedSeatUserIds);
      expect(log.events.length).toBeGreaterThan(0);
      expect(log.events[0]?.payload).toMatchObject({ type: "GameStarted" });
      // seq must be gapless from 1 — this is what rebuildPlayerView expects.
      log.events.forEach((event, seqIndex) => expect(event.seq).toBe(seqIndex + 1));
    });
  });
});

describe("RoomService — getReplay (phase 4.5 step 3)", () => {
  const playOneFinishedGame = (service: RoomService, gameService: GameService): Room => {
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.ready(room.id, "host", true);
    service.start(room.id);
    let steps = 0;
    while (room.finishedGames.length < 1 && steps < 500) {
      steps += 1;
      const legalActions = gameService.getLegalActions(room.gameState, 0);
      service.applyPlayerAction(room.id, 0, legalActions[0]);
    }
    return room;
  };

  it("returns the seated player's reconstructed view + filtered events for their own game", async () => {
    const service = newRoomService();
    const gameService = new GameService();
    const room = playOneFinishedGame(service, gameService);

    const result = await service.getReplay(room.id, 1, "host");

    expect(result.gameNumber).toBe(1);
    expect(result.finalView).toMatchObject({ seat: 0 });
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events[0]?.payload).toMatchObject({ type: "GameStarted" });
  });

  it("throws GAME_NOT_FOUND for a gameNumber this room never archived", async () => {
    const service = newRoomService();
    const gameService = new GameService();
    const room = playOneFinishedGame(service, gameService);

    await expect(service.getReplay(room.id, 99, "host")).rejects.toThrow(RoomServiceError);
    try {
      await service.getReplay(room.id, 99, "host");
    } catch (error) {
      expect((error as RoomServiceError).code).toBe("GAME_NOT_FOUND");
    }
  });

  it("throws UNAUTHORIZED for a userId who was never seated in that game", async () => {
    const service = newRoomService();
    const gameService = new GameService();
    const room = playOneFinishedGame(service, gameService);

    try {
      await service.getReplay(room.id, 1, "someone-else");
      throw new Error("expected getReplay to throw");
    } catch (error) {
      expect((error as RoomServiceError).code).toBe("UNAUTHORIZED");
    }
  });

  it("uses the archived seatUserIds snapshot, not room.players' current occupancy", async () => {
    const service = newRoomService();
    const gameService = new GameService();
    const room = playOneFinishedGame(service, gameService);
    const originalSeat1UserId = room.finishedGames[0]!.seatUserIds[1];
    // Simulate seat 1 later being reoccupied by someone else — this can't
    // happen through today's public API (rooms never return to "waiting"
    // mid-session), but the archive must stay correct if that ever changes.
    room.players[1] = { ...room.players[1]!, userId: "someone-new" };

    const result = await service.getReplay(room.id, 1, originalSeat1UserId!);
    expect(result.finalView).toMatchObject({ seat: 1 });
    await expect(service.getReplay(room.id, 1, "someone-new")).rejects.toThrow(RoomServiceError);
  });
});

describe("RoomService — getReplayOmniscientView (phase 4.5 step 5)", () => {
  const playOneFinishedGame = (service: RoomService, gameService: GameService): Room => {
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.ready(room.id, "host", true);
    service.start(room.id);
    let steps = 0;
    while (room.finishedGames.length < 1 && steps < 500) {
      steps += 1;
      const legalActions = gameService.getLegalActions(room.gameState, 0);
      service.applyPlayerAction(room.id, 0, legalActions[0]);
    }
    return room;
  };

  it("reconstructs all four hands + wall from the archived finalState (fed straight into getOmniscientView, no event replay)", async () => {
    const service = newRoomService();
    const gameService = new GameService();
    const room = playOneFinishedGame(service, gameService);

    const view = await service.getReplayOmniscientView(room.id, 1);

    expect(view.hands).toHaveLength(4);
    // Game already finished (won), so melds/discards also hold physical
    // tiles by now — wall+hands is a subset of the 136-tile set, not the
    // whole thing (that only holds for a state with none dealt out yet).
    const allIds = [...view.wall, ...view.hands.flat()];
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds.length).toBeGreaterThan(0);
    expect(allIds.length).toBeLessThanOrEqual(136);
  });

  it("throws GAME_NOT_FOUND for a gameNumber this room never archived", async () => {
    const service = newRoomService();
    const gameService = new GameService();
    const room = playOneFinishedGame(service, gameService);

    try {
      await service.getReplayOmniscientView(room.id, 99);
      throw new Error("expected getReplayOmniscientView to throw");
    } catch (error) {
      expect((error as RoomServiceError).code).toBe("GAME_NOT_FOUND");
    }
  });
});

describe("RoomService — handleDisconnect (phase 4.2 acceptance criterion)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it("is a no-op for an unknown room (best-effort, no ack to fail through)", () => {
    const service = newRoomService();
    expect(() => service.handleDisconnect("no-such-room", "p1")).not.toThrow();
  });

  it("is a no-op while the room is still waiting (评审点 H is mid-game only)", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });

    service.handleDisconnect(room.id, "host");

    expect(room.players[0]).toMatchObject({ isAutoPiloted: false });
  });

  it("never marks a bot seat auto-piloted", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    const bot = service.addBot(room.id, "host");

    service.handleDisconnect(room.id, bot.userId);

    expect(room.players[bot.seatId]).toMatchObject({ isBot: true, isAutoPiloted: false });
  });

  it("a disconnected seat is auto-played through the rest of the session", () => {
    const service = newRoomService();
    const gameService = new GameService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);

    service.handleDisconnect(room.id, "p2");
    expect(room.players[1]).toMatchObject({
      userId: "p2",
      isDisconnected: true,
      isAutoPiloted: false,
    });
    jest.advanceTimersByTime(60_000);
    expect(room.players[1]).toMatchObject({ isAutoPiloted: true, isDisconnected: false });

    // p2 (seat 1) is now driven by autoPlayBots; this loop only ever supplies
    // actions for the three still-connected seats, in a fixed scan order —
    // same shape as the bot-only acceptance test above, just with humans.
    const connectedSeats = [0, 2, 3] as const;
    let steps = 0;
    while (room.phase === "in-game" && steps < 2000) {
      steps += 1;
      const seat = connectedSeats.find(
        (candidate) => gameService.getLegalActions(room.gameState, candidate).length > 0,
      );
      if (seat === undefined) {
        throw new Error("no connected seat has a legal action — game got stuck");
      }
      const legalActions = gameService.getLegalActions(room.gameState, seat);
      service.applyPlayerAction(room.id, seat, legalActions[0]);
    }

    expect(room.phase).toBe("finished");
    expect(room.result?.gamesPlayed).toBe(4);
  });

  it("restores a disconnected seat during the grace period and cancels permanent takeover", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);

    service.handleDisconnect(room.id, "p2");
    const resumed = service.reconnect(room.id, "p2");

    expect(resumed).toMatchObject({ seat: 1, seq: expect.any(Number), view: { seat: 1 } });
    expect(room.players[1]).toMatchObject({ isDisconnected: false, isAutoPiloted: false });
    jest.advanceTimersByTime(60_000);
    expect(room.players[1]).toMatchObject({ isDisconnected: false, isAutoPiloted: false });
  });

  it("closes the room once the last human seat disconnects (nobody left to play for)", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.ready(room.id, "host", true);
    service.start(room.id);
    expect(room.phase).toBe("in-game");

    service.handleDisconnect(room.id, "host");
    jest.advanceTimersByTime(60_000);

    expect(room.phase).toBe("finished");
    expect(room.status).toBe("closed");
  });
});

describe("RoomService — full 4-round session (real junk engine)", () => {
  it("plays 4 complete games and finishes the session with a ranking", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);

    for (let round = 0; round < 4; round++) {
      expect(room.phase).toBe("in-game");
      expect(room.gameNumber).toBe(round + 1);
      expect(room.dealer).toBe(round as 0 | 1 | 2 | 3);

      const played = playJunkGame(room.seed, {}, [], room.dealer);
      if ("error" in played) throw new Error(`playJunkGame failed: ${played.error}`);

      for (const { seat, action } of played.actions) {
        if (room.phase !== "in-game") break;
        service.applyPlayerAction(room.id, seat, action);
      }
    }

    expect(room.phase).toBe("finished");
    expect(room.status).toBe("closed");
    expect(room.result).toBeDefined();
    expect(room.result?.gamesPlayed).toBe(4);
    expect(room.result?.ranking).toHaveLength(4);
    const scores = room.result?.ranking.map((entry) => entry.score) ?? [];
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
