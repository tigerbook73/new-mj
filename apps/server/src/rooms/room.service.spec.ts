import { playJunkGame } from "@new-mj/core";
import { ConfigService } from "../config/config.service";
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
  awaitingNextRound: false,
  createdAt: Date.now(),
  currentGameEvents: [],
  currentGameSeatUserIds: [null, null, null, null],
  finishedGames: [],
  ...overrides,
});

const newRoomService = () =>
  new RoomService(new GameService(), new EventBus(), fakePersistenceService(), new ConfigService());

const isPassAction = (action: unknown): boolean =>
  typeof action === "object" && action !== null && "type" in action && action.type === "pass";

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

describe("RoomService — findActiveRoomForUser (userId→roomId reverse index)", () => {
  it("maps the host after create, and a joined player after join", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    expect(service.findActiveRoomForUser("host")).toBe(room.id);

    service.join(room.id, "p2", "P2");
    expect(service.findActiveRoomForUser("p2")).toBe(room.id);
  });

  it("never maps a bot's synthetic userId", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    const bot = service.addBot(room.id, "host");

    expect(service.findActiveRoomForUser(bot.userId)).toBeUndefined();
  });

  it("waiting phase: a non-host leaving clears just their mapping", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.join(room.id, "p2", "P2");

    service.leave(room.id, "p2");

    expect(service.findActiveRoomForUser("p2")).toBeUndefined();
    expect(service.findActiveRoomForUser("host")).toBe(room.id);
  });

  it("waiting phase: the host leaving (room deleted) clears every seated userId's mapping", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.join(room.id, "p2", "P2");

    service.leave(room.id, "host");

    expect(service.findActiveRoomForUser("host")).toBeUndefined();
    expect(service.findActiveRoomForUser("p2")).toBeUndefined();
  });

  it("removePlayer clears the removed userId's mapping", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.join(room.id, "p2", "P2");

    service.removePlayer(room.id, "host", 1);

    expect(service.findActiveRoomForUser("p2")).toBeUndefined();
  });

  it("in-game leave (auto-pilot) does NOT clear the mapping — explicit design decision", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);

    service.leave(room.id, "p2");

    expect(room.players[1]).toMatchObject({ isAutoPiloted: true });
    expect(service.findActiveRoomForUser("p2")).toBe(room.id);
  });

  it("closeAbandonedRoom (last human seat disconnects mid-game) clears every seated userId's mapping", () => {
    jest.useFakeTimers();
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.addBot(room.id, "host");
    service.ready(room.id, "host", true);
    service.start(room.id);

    service.handleDisconnect(room.id, "host");
    jest.advanceTimersByTime(60_000);

    expect(room.phase).toBe("finished");
    expect(service.findActiveRoomForUser("host")).toBeUndefined();
    jest.useRealTimers();
  });

  it("a session finishing (4 rounds played) clears every seated userId's mapping", () => {
    const service = newRoomService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);

    for (let round = 0; round < 4; round++) {
      const played = playJunkGame(room.seed, {}, [], room.dealer);
      if ("error" in played) throw new Error(`playJunkGame failed: ${played.error}`);
      for (const { seat, action } of played.actions) {
        if (room.phase !== "in-game") break;
        service.applyPlayerAction(room.id, seat, action);
      }
      // Round ended but the session continues — every real seat must confirm
      // (§6 局间确认) before the next round's seed/actions exist.
      if (room.phase === "in-game") {
        for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
      }
    }

    expect(room.phase).toBe("finished");
    for (const userId of ["host", "p2", "p3", "p4"]) {
      expect(service.findActiveRoomForUser(userId)).toBeUndefined();
    }
  });

  it("creating a second room while still mapped to an unfinished first room overwrites the mapping (last write wins)", () => {
    const service = newRoomService();
    service.create("host", "Host", "junk", { rulesetId: "junk" });
    const second = service.create(
      "host",
      "Host",
      "junk",
      { rulesetId: "junk" },
      "4-round",
      "Room 2",
    );

    expect(service.findActiveRoomForUser("host")).toBe(second.id);
  });
});

describe("RoomService — bot auto-play (phase 4 acceptance criterion)", () => {
  it("delays one bot action, then re-reads and schedules the next step", () => {
    jest.useFakeTimers();
    try {
      type FakeState = { turn: 0 | 1; seq: number };
      const calls: Array<{ seat: number; action: unknown }> = [];
      const fakeGameService = {
        createGame: () => ({ state: { turn: 0, seq: 0 }, events: [] }),
        applyAction: (state: FakeState, seat: number, action: unknown) => {
          calls.push({ seat, action });
          const nextTurn = seat === 0 ? 1 : 0;
          const seq = state.seq + 1;
          return {
            state: { turn: nextTurn, seq },
            events: [{ seq, visibility: { type: "public" }, payload: { type: "TestAction" } }],
          };
        },
        getLegalActions: (state: FakeState, seat: number) =>
          seat === state.turn ? [{ type: seat === 0 ? "open" : "bot" }] : [],
        getPlayerView: (_state: FakeState, seat: 0 | 1 | 2 | 3) => ({
          seat,
          hand: [],
          seats: [{ handCount: 0 }, { handCount: 0 }, { handCount: 0 }, { handCount: 0 }],
          wallCount: 0,
          currentSeat: 0,
        }),
        computeNextDealer: () => 0,
      } as unknown as GameService;
      const config = new ConfigService();
      Object.defineProperty(config, "botActionDelayRangeMs", { value: [600, 600] });
      const service = new RoomService(
        fakeGameService,
        new EventBus(),
        fakePersistenceService(),
        config,
      );
      const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
      service.addBot(room.id, "host");
      service.addBot(room.id, "host");
      service.addBot(room.id, "host");
      service.ready(room.id, "host", true);
      service.start(room.id);

      service.applyPlayerAction(room.id, 0, { type: "open" });
      expect(calls).toEqual([{ seat: 0, action: { type: "open" } }]);
      jest.advanceTimersByTime(599);
      expect(calls).toHaveLength(1);
      jest.advanceTimersByTime(1);
      expect(calls).toEqual([
        { seat: 0, action: { type: "open" } },
        { seat: 1, action: { type: "bot" } },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

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
    // ever supplies seat-0 actions. No legal action means a round just ended
    // and the session continues (§6 局间确认) — confirm ready and move on;
    // the bot seats already auto-confirmed.
    let steps = 0;
    while (room.phase === "in-game" && steps < 500) {
      steps += 1;
      const legalActions = gameService.getLegalActions(room.gameState, 0);
      if (legalActions.length === 0) {
        service.ready(room.id, "host", true);
        continue;
      }
      service.applyPlayerAction(room.id, 0, legalActions[0]);
    }

    expect(room.phase).toBe("finished");
    expect(room.result?.gamesPlayed).toBe(4);
  });
});

// Phase 3 leftover (table-ux-plan.md item 4): targeted regressions for the
// single-timer bot scheduler crossing paths with game end, leave, disconnect
// takeover, and the independent claim-window timer.
describe("RoomService — bot auto-play timer interplay (phase 3 regression)", () => {
  it("clears a pending bot timer when a different seat's response ends the game first", () => {
    jest.useFakeTimers();
    try {
      type FakeState = { turn: 0 | 1; seq: number; ended: boolean };
      const calls: Array<{ seat: number; action: unknown }> = [];
      const fakeGameService = {
        createGame: () => ({ state: { turn: 0, seq: 0, ended: false }, events: [] }),
        applyAction: (state: FakeState, seat: number, action: { type: string }) => {
          calls.push({ seat, action });
          const seq = state.seq + 1;
          if (action.type === "hu") {
            return {
              state: { ...state, seq, ended: true },
              events: [{ seq, visibility: { type: "public" }, payload: { type: "GameEnded" } }],
            };
          }
          const nextTurn = seat === 0 ? 1 : 0;
          return {
            state: { turn: nextTurn, seq, ended: false },
            events: [{ seq, visibility: { type: "public" }, payload: { type: "TestAction" } }],
          };
        },
        // seat 2 always has an out-of-turn "hu" claim available, independent
        // of whose normal turn it is — models a claim window that can end the
        // game while a bot's own turn action is already scheduled.
        getLegalActions: (state: FakeState, seat: number) => {
          if (state.ended) return [];
          if (seat === 2) return [{ type: "hu" }];
          return seat === state.turn ? [{ type: seat === 0 ? "open" : "bot" }] : [];
        },
        getPlayerView: (_state: FakeState, seat: 0 | 1 | 2 | 3) => ({
          seat,
          hand: [],
          seats: [{ handCount: 0 }, { handCount: 0 }, { handCount: 0 }, { handCount: 0 }],
          wallCount: 0,
          currentSeat: 0,
        }),
        computeNextDealer: () => 0,
      } as unknown as GameService;
      const config = new ConfigService();
      Object.defineProperty(config, "botActionDelayRangeMs", { value: [600, 600] });
      const service = new RoomService(
        fakeGameService,
        new EventBus(),
        fakePersistenceService(),
        config,
      );
      // best-of-3 so a single GameEnded event finishes the whole session
      // (shouldContinue is always false), keeping the fixture minimal.
      const room = service.create("host", "Host", "junk", { rulesetId: "junk" }, "best-of-3");
      service.join(room.id, "p2", "P2");
      service.join(room.id, "p3", "P3");
      service.join(room.id, "p4", "P4");
      for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
      service.start(room.id);

      service.applyPlayerAction(room.id, 0, { type: "open" });
      expect(calls).toEqual([{ seat: 0, action: { type: "open" } }]);

      // Seat 2's claim ends the game before the seat-1 bot timer (600ms) fires.
      service.applyPlayerAction(room.id, 2, { type: "hu" });
      expect(room.phase).toBe("finished");

      jest.advanceTimersByTime(10_000);
      expect(calls).toEqual([
        { seat: 0, action: { type: "open" } },
        { seat: 2, action: { type: "hu" } },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  // seat 0 = host (real player), seat 1 = bot; seats 2/3 are bystander humans
  // who never take a turn in this fixture — they exist only so the room
  // still has a human left once seat 0 goes auto-piloted (otherwise
  // markAutoPiloted's hasNoHumanLeft check would close the room outright,
  // masking the behavior under test).
  const twoSeatCycleFixture = () => {
    type FakeState = { turn: 0 | 1; seq: number };
    const calls: Array<{ seat: number }> = [];
    const fakeGameService = {
      createGame: () => ({ state: { turn: 0, seq: 0 }, events: [] }),
      applyAction: (state: FakeState, seat: number) => {
        calls.push({ seat });
        const seq = state.seq + 1;
        const nextTurn = seat === 0 ? 1 : 0;
        return {
          state: { turn: nextTurn, seq },
          events: [{ seq, visibility: { type: "public" }, payload: { type: "TestAction" } }],
        };
      },
      getLegalActions: (state: FakeState, seat: number) =>
        seat === state.turn ? [{ type: "step" }] : [],
      getPlayerView: (_state: FakeState, seat: 0 | 1 | 2 | 3) => ({
        seat,
        hand: [],
        seats: [{ handCount: 0 }, { handCount: 0 }, { handCount: 0 }, { handCount: 0 }],
        wallCount: 0,
        currentSeat: 0,
      }),
      computeNextDealer: () => 0,
    } as unknown as GameService;
    return { fakeGameService, calls };
  };

  it("leaving mid-game while a bot timer is pending hands off control without a duplicate schedule", () => {
    jest.useFakeTimers();
    try {
      const { fakeGameService, calls } = twoSeatCycleFixture();
      const config = new ConfigService();
      Object.defineProperty(config, "botActionDelayRangeMs", { value: [600, 600] });
      const service = new RoomService(
        fakeGameService,
        new EventBus(),
        fakePersistenceService(),
        config,
      );
      const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
      service.addBot(room.id, "host", 1);
      service.join(room.id, "p3", "P3", 2);
      service.join(room.id, "p4", "P4", 3);
      for (const userId of ["host", "p3", "p4"]) service.ready(room.id, userId, true);
      service.start(room.id);

      // seat 0 (host) takes its turn, which schedules a bot timer for seat 1.
      service.applyPlayerAction(room.id, 0, { type: "step" });
      expect(calls).toEqual([{ seat: 0 }]);

      // Host leaves while that timer is still pending — markAutoPiloted's
      // trailing autoPlayBots() call must see the existing timer and no-op
      // rather than scheduling a second one.
      service.leave(room.id, "host");
      expect(room.players[0]).toMatchObject({ isAutoPiloted: true });

      jest.advanceTimersByTime(600);
      expect(calls).toEqual([{ seat: 0 }, { seat: 1 }]);

      // Turn cycles back to seat 0, now auto-piloted — it must keep playing
      // itself without any further human input.
      jest.advanceTimersByTime(600);
      expect(calls).toEqual([{ seat: 0 }, { seat: 1 }, { seat: 0 }]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a disconnect-grace takeover overlapping a pending bot timer does not double-schedule", () => {
    jest.useFakeTimers();
    process.env["DISCONNECT_GRACE_MS"] = "700";
    try {
      const { fakeGameService, calls } = twoSeatCycleFixture();
      const config = new ConfigService();
      Object.defineProperty(config, "botActionDelayRangeMs", { value: [1_000, 1_000] });
      const service = new RoomService(
        fakeGameService,
        new EventBus(),
        fakePersistenceService(),
        config,
      );
      const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
      service.addBot(room.id, "host", 1);
      service.join(room.id, "p3", "P3", 2);
      service.join(room.id, "p4", "P4", 3);
      for (const userId of ["host", "p3", "p4"]) service.ready(room.id, userId, true);
      service.start(room.id);

      // seat 0's turn schedules a bot timer for seat 1, due at t=1000.
      service.applyPlayerAction(room.id, 0, { type: "step" });
      expect(calls).toEqual([{ seat: 0 }]);

      // Host disconnects at t=0; the 700ms grace timer will elapse at t=700,
      // while the 1000ms bot timer for seat 1 is still pending.
      service.handleDisconnect(room.id, "host");

      jest.advanceTimersByTime(700);
      // markAutoPiloted's trailing autoPlayBots() call must see the still-live
      // seat-1 timer and no-op instead of scheduling a second one — if it
      // didn't, a stray extra action would appear ahead of schedule below.
      expect(room.players[0]).toMatchObject({ isAutoPiloted: true, isDisconnected: false });
      expect(calls).toEqual([{ seat: 0 }]);

      jest.advanceTimersByTime(300);
      expect(calls).toEqual([{ seat: 0 }, { seat: 1 }]);

      // Turn cycles back to the now-autopiloted seat 0 and keeps going, right
      // on the normal 1000ms cadence — no early/duplicate firing.
      jest.advanceTimersByTime(999);
      expect(calls).toEqual([{ seat: 0 }, { seat: 1 }]);
      jest.advanceTimersByTime(1);
      expect(calls).toEqual([{ seat: 0 }, { seat: 1 }, { seat: 0 }]);
    } finally {
      jest.useRealTimers();
      delete process.env["DISCONNECT_GRACE_MS"];
    }
  });

  it("an independent claim-window timeout does not disturb an already-pending bot action timer", () => {
    jest.useFakeTimers();
    process.env["CLAIM_TIMEOUT_MS"] = "100";
    try {
      type FakeState = { responders: number[]; botTurn: boolean; seq: number };
      const calls: Array<{ seat: number; action: unknown }> = [];
      const fakeGameService = {
        createGame: () => ({ state: { responders: [], botTurn: false, seq: 0 }, events: [] }),
        applyAction: (state: FakeState, seat: number, action: { type: string }) => {
          calls.push({ seat, action });
          const seq = state.seq + 1;
          if (action.type === "open") {
            return {
              state: { responders: [2], botTurn: true, seq },
              events: [{ seq, visibility: { type: "public" }, payload: { type: "TestAction" } }],
            };
          }
          // "pass"/"bot" both just clear their own actor from availability.
          const responders = state.responders.filter((candidate) => candidate !== seat);
          const botTurn = seat === 1 ? false : state.botTurn;
          return {
            state: { responders, botTurn, seq },
            events: [{ seq, visibility: { type: "public" }, payload: { type: "TestAction" } }],
          };
        },
        getLegalActions: (state: FakeState, seat: number) => {
          if (state.responders.includes(seat)) return [{ type: "pass" }];
          if (seat === 1 && state.botTurn) return [{ type: "bot" }];
          return seat === 0 && state.responders.length === 0 && !state.botTurn
            ? [{ type: "open" }]
            : [];
        },
        getPlayerView: (_state: FakeState, seat: 0 | 1 | 2 | 3) => ({
          seat,
          hand: [],
          seats: [{ handCount: 0 }, { handCount: 0 }, { handCount: 0 }, { handCount: 0 }],
          wallCount: 0,
          currentSeat: 0,
        }),
        computeNextDealer: () => 0,
      } as unknown as GameService;
      const config = new ConfigService();
      Object.defineProperty(config, "botActionDelayRangeMs", { value: [250, 250] });
      const service = new RoomService(
        fakeGameService,
        new EventBus(),
        fakePersistenceService(),
        config,
      );
      const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
      // seat 2 (the claim responder) stays human; seats 1 and 3 are bots.
      service.addBot(room.id, "host", 1);
      service.join(room.id, "p2", "P2", 2);
      service.addBot(room.id, "host", 3);
      for (const userId of ["host", "p2"]) service.ready(room.id, userId, true);
      service.start(room.id);

      // Opens both a 100ms claim window for seat 2 and a 250ms bot timer for
      // seat 1 at the same moment.
      service.applyPlayerAction(room.id, 0, { type: "open" });
      expect(calls).toEqual([{ seat: 0, action: { type: "open" } }]);

      jest.advanceTimersByTime(100);
      // Claim timeout submitted seat 2's forced pass; the still-pending bot
      // timer for seat 1 must not have been touched by it.
      expect(calls).toEqual([
        { seat: 0, action: { type: "open" } },
        { seat: 2, action: { type: "pass" } },
      ]);

      jest.advanceTimersByTime(150);
      expect(calls).toEqual([
        { seat: 0, action: { type: "open" } },
        { seat: 2, action: { type: "pass" } },
        { seat: 1, action: { type: "bot" } },
      ]);
    } finally {
      jest.useRealTimers();
      delete process.env["CLAIM_TIMEOUT_MS"];
    }
  });
});

describe("RoomService — authoritative action snapshots", () => {
  it("emits action events before one authoritative snapshot for every seat", () => {
    const eventBus = new EventBus();
    const service = new RoomService(
      new GameService(),
      eventBus,
      fakePersistenceService(),
      new ConfigService(),
    );
    const gameService = new GameService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);

    const emitted: Array<{ type: "event" | "snapshot"; seat?: number; seq: number }> = [];
    eventBus.on("game:event", ({ event }) => emitted.push({ type: "event", seq: event.seq }));
    eventBus.on("game:snapshot", ({ seat, seq }) => emitted.push({ type: "snapshot", seat, seq }));

    const seat = ([0, 1, 2, 3] as const).find(
      (candidate) => gameService.getLegalActions(room.gameState, candidate).length > 0,
    );
    expect(seat).toBeDefined();
    const action = gameService.getLegalActions(room.gameState, seat!)[0];
    expect(action).toBeDefined();
    service.applyPlayerAction(room.id, seat!, action);

    const firstSnapshot = emitted.findIndex(({ type }) => type === "snapshot");
    expect(firstSnapshot).toBeGreaterThan(0);
    expect(emitted.slice(0, firstSnapshot).every(({ type }) => type === "event")).toBe(true);
    const snapshots = emitted.slice(firstSnapshot);
    expect(snapshots).toHaveLength(4);
    expect(snapshots.map(({ seat: snapshotSeat }) => snapshotSeat)).toEqual([0, 1, 2, 3]);
    expect(new Set(snapshots.map(({ seq }) => seq))).toEqual(new Set([room.lastEventSeq]));
  });
});

describe("RoomService — game advice", () => {
  it("returns a legal recommendation without mutating game state or emitting events", () => {
    const eventBus = new EventBus();
    const service = new RoomService(
      new GameService(),
      eventBus,
      fakePersistenceService(),
      new ConfigService(),
    );
    const gameService = new GameService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);
    const seat = ([0, 1, 2, 3] as const).find(
      (candidate) => gameService.getLegalActions(room.gameState, candidate).length > 0,
    )!;
    const stateBefore = room.gameState;
    const seqBefore = room.lastEventSeq;
    const emitted: unknown[] = [];
    eventBus.on("game:event", (event) => emitted.push(event));
    eventBus.on("game:snapshot", (event) => emitted.push(event));

    const advice = service.getAdvice(room.id, seat);

    expect(advice.seq).toBe(seqBefore);
    expect(advice.actions).toEqual(gameService.getLegalActions(room.gameState, seat));
    expect(advice.recommendedActionIndex).toBeGreaterThanOrEqual(0);
    expect(advice.recommendedActionIndex).toBeLessThan(advice.actions.length);
    expect(room.gameState).toBe(stateBefore);
    expect(room.lastEventSeq).toBe(seqBefore);
    expect(emitted).toEqual([]);
  });

  it("returns no recommendation for a seat with no legal action", () => {
    const service = newRoomService();
    const gameService = new GameService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);
    const idleSeat = ([0, 1, 2, 3] as const).find(
      (candidate) => gameService.getLegalActions(room.gameState, candidate).length === 0,
    )!;

    expect(service.getAdvice(room.id, idleSeat)).toMatchObject({ actions: [] });
    expect(service.getAdvice(room.id, idleSeat).recommendedActionIndex).toBeUndefined();
  });
});

describe("RoomService — claim timeout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    process.env["CLAIM_TIMEOUT_MS"] = "100";
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env["CLAIM_TIMEOUT_MS"];
  });

  it("attaches one absolute deadline per eligible seat and submits pass through runAction", () => {
    const eventBus = new EventBus();
    const service = new RoomService(
      new GameService(),
      eventBus,
      fakePersistenceService(),
      new ConfigService(),
    );
    const gameService = new GameService();
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);

    const snapshots: Array<{ seat: number; deadline?: number }> = [];
    eventBus.on("game:snapshot", ({ seat, deadline }) =>
      snapshots.push({ seat, ...(deadline !== undefined ? { deadline } : {}) }),
    );
    const played = playJunkGame(room.seed, {}, [], room.dealer);
    if ("error" in played) throw new Error(`playJunkGame failed: ${played.error}`);

    let responders: readonly number[] = [];
    for (const { seat, action } of played.actions) {
      service.applyPlayerAction(room.id, seat, action);
      responders = ([0, 1, 2, 3] as const).filter((candidate) =>
        gameService.getLegalActions(room.gameState, candidate).some((legal) => isPassAction(legal)),
      );
      if (responders.length > 0) break;
    }

    expect(responders.length).toBeGreaterThan(0);
    const deadlines = snapshots
      .slice(-4)
      .filter(({ seat }) => responders.includes(seat))
      .map(({ deadline }) => deadline);
    expect(deadlines.every((deadline) => deadline === Date.now() + 100)).toBe(true);

    const reconnectingSeat = responders[0]! as 0 | 1 | 2 | 3;
    const reconnectingUser = room.players[reconnectingSeat]!.userId;
    service.handleDisconnect(room.id, reconnectingUser);
    expect(service.reconnect(room.id, reconnectingUser)?.deadline).toBe(Date.now() + 100);

    jest.advanceTimersByTime(100);
    for (const seat of responders) {
      expect(
        gameService.getLegalActions(room.gameState, seat as 0 | 1 | 2 | 3).some(isPassAction),
      ).toBe(false);
    }
  });

  it("does not extend another responder's deadline after a partial response", () => {
    type FakeState = { responders: number[]; seq: number };
    const fakeGameService = {
      createGame: () => ({ state: { responders: [], seq: 0 }, events: [] }),
      applyAction: (state: FakeState, seat: number, action: { type: string }) => {
        const responders =
          action.type === "open"
            ? [1, 2]
            : state.responders.filter((candidate) => candidate !== seat);
        const seq = state.seq + 1;
        return {
          state: { responders, seq },
          events: [{ seq, visibility: { type: "public" }, payload: { type: "TestAction" } }],
        };
      },
      getLegalActions: (state: FakeState, seat: number) =>
        state.responders.includes(seat) ? [{ type: "pass" }] : seat === 0 ? [{ type: "open" }] : [],
      getPlayerView: (_state: FakeState, seat: 0 | 1 | 2 | 3) => ({
        seat,
        hand: [],
        seats: [{ handCount: 0 }, { handCount: 0 }, { handCount: 0 }, { handCount: 0 }],
        wallCount: 0,
        currentSeat: 0,
      }),
      computeNextDealer: () => 0,
    } as unknown as GameService;
    const service = new RoomService(
      fakeGameService,
      new EventBus(),
      fakePersistenceService(),
      new ConfigService(),
    );
    const room = service.create("host", "Host", "junk", { rulesetId: "junk" });
    for (const userId of ["p2", "p3", "p4"]) service.join(room.id, userId, userId);
    for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
    service.start(room.id);

    service.applyPlayerAction(room.id, 0, { type: "open" });
    const originalDeadline = Date.now() + 100;
    jest.advanceTimersByTime(40);
    service.applyPlayerAction(room.id, 1, { type: "pass" });
    expect(service.reconnect(room.id, "p3")).toBeUndefined();

    jest.advanceTimersByTime(59);
    expect(fakeGameService.getLegalActions(room.gameState as FakeState, 2)).toEqual([
      { type: "pass" },
    ]);
    jest.advanceTimersByTime(1);
    expect(fakeGameService.getLegalActions(room.gameState as FakeState, 2)).toEqual([]);
    expect(originalDeadline).toBe(Date.now());
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
      if (legalActions.length === 0) {
        // Round ended, session continues (§6 局间确认) — confirm and move on.
        service.ready(room.id, "host", true);
        continue;
      }
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
        // Round ended, session continues (§6 局间确认) — confirm every
        // connected seat (p2/seat1 is autopiloted and already auto-confirmed).
        for (const userId of ["host", "p3", "p4"]) service.ready(room.id, userId, true);
        continue;
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
      // Round ended but the session continues — every real seat must confirm
      // (§6 局间确认) before the next round's seed/dealer exist.
      if (room.phase === "in-game") {
        for (const userId of ["host", "p2", "p3", "p4"]) service.ready(room.id, userId, true);
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
