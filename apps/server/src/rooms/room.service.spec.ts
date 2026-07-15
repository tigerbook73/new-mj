import { playJunkGame } from "@new-mj/core";
import { GameService } from "../core/game.service";
import { EventBus } from "./event-bus";
import type { Room } from "./room";
import { RoomServiceError } from "./room-service.error";
import { RoomService } from "./room.service";

const makeRoom = (overrides: Partial<Room> = {}): Room => ({
  id: "room-1",
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
  ...overrides,
});

const newRoomService = () => new RoomService(new GameService(), new EventBus());

describe("RoomService — pure helpers", () => {
  it("accumulateScores adds deltas seat-wise across multiple calls", () => {
    const service = newRoomService();
    const room = makeRoom();

    service.accumulateScores(room, [100, -30, -40, -30]);
    expect(room.scores).toEqual([100, -30, -40, -30]);

    service.accumulateScores(room, [50, 0, 25, -75]);
    expect(room.scores).toEqual([150, -30, -15, -105]);
  });

  it("computeNextDealer rotates clockwise (rooms.md §4.1)", () => {
    const service = newRoomService();
    expect(service.computeNextDealer("4-round", 0)).toBe(1);
    expect(service.computeNextDealer("4-round", 3)).toBe(0);
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

      const played = playJunkGame(room.seed, {}, []);
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
