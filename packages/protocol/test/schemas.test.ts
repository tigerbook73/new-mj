import { describe, expect, it } from "vitest";
import {
  AuthHandshakeSchema,
  ERROR_CODES,
  EventVisibilitySchema,
  GameActionRequestSchema,
  GameEventEnvelopeSchema,
  GameSnapshotSchema,
  PlayerViewBaseSchema,
  RoomCreateRequestSchema,
  RoomDealerChangedEventSchema,
  RoomInfoSchema,
  RoomJoinRequestSchema,
  RoomPlayerJoinedEventSchema,
  RoomReadyChangedEventSchema,
  RoomReadyRequestSchema,
  RoomScoreUpdatedEventSchema,
  RoomSessionFinishedEventSchema,
  RoomStartRequestSchema,
} from "../src/schemas.ts";

const validRoomInfo = {
  id: "room-1",
  rulesetId: "bloodbattle",
  config: { rulesetId: "bloodbattle" },
  sessionFormat: "4-round" as const,
  phase: "waiting" as const,
  status: "open" as const,
  players: [null, null, null, null] as const,
  scores: [0, 0, 0, 0] as const,
  gameNumber: 1,
  dealer: 0 as const,
  createdAt: Date.now(),
};

describe("RoomInfoSchema", () => {
  it("accepts a minimal valid room snapshot", () => {
    expect(RoomInfoSchema.parse(validRoomInfo)).toEqual(validRoomInfo);
  });

  it("rejects a dealer value outside 0-3", () => {
    expect(() => RoomInfoSchema.parse({ ...validRoomInfo, dealer: 4 })).toThrow();
  });

  it("rejects a players tuple with the wrong length", () => {
    expect(() => RoomInfoSchema.parse({ ...validRoomInfo, players: [null, null, null] })).toThrow();
  });
});

describe("RoomCreateRequestSchema", () => {
  it("allows rulesetId alone, config and sessionFormat are optional", () => {
    expect(RoomCreateRequestSchema.parse({ rulesetId: "junk" })).toEqual({ rulesetId: "junk" });
  });

  it("rejects an unknown sessionFormat", () => {
    expect(() =>
      RoomCreateRequestSchema.parse({ rulesetId: "junk", sessionFormat: "best-of-5" }),
    ).toThrow();
  });
});

describe("RoomJoinRequestSchema / RoomReadyRequestSchema", () => {
  it("requires roomId as a string", () => {
    expect(() => RoomJoinRequestSchema.parse({})).toThrow();
    expect(RoomJoinRequestSchema.parse({ roomId: "room-1" })).toEqual({ roomId: "room-1" });
  });

  it("requires ready as a boolean", () => {
    expect(() => RoomReadyRequestSchema.parse({ ready: "yes" })).toThrow();
  });
});

describe("GameActionRequestSchema", () => {
  it("passes through an opaque action payload without validating its shape", () => {
    const payload = { action: { type: "discard", tile: 12 } };
    expect(GameActionRequestSchema.parse(payload)).toEqual(payload);
  });
});

describe("RoomStartRequestSchema", () => {
  it("accepts an empty object (ack is a bare receipt)", () => {
    expect(RoomStartRequestSchema.parse({})).toEqual({});
  });
});

describe("AuthHandshakeSchema", () => {
  it("accepts token + protocolVersion without resume", () => {
    const payload = { token: "jwt", protocolVersion: "1.0" };
    expect(AuthHandshakeSchema.parse(payload)).toEqual(payload);
  });

  it("accepts an optional resume.roomId", () => {
    const payload = { token: "jwt", protocolVersion: "1.0", resume: { roomId: "room-1" } };
    expect(AuthHandshakeSchema.parse(payload)).toEqual(payload);
  });

  it("rejects a missing token", () => {
    expect(() => AuthHandshakeSchema.parse({ protocolVersion: "1.0" })).toThrow();
  });
});

describe("room:* event schemas", () => {
  it("RoomPlayerJoinedEventSchema requires seat/nickname/isBot", () => {
    const payload = { seat: 0 as const, nickname: "Alice", isBot: false };
    expect(RoomPlayerJoinedEventSchema.parse(payload)).toEqual(payload);
    expect(() => RoomPlayerJoinedEventSchema.parse({ seat: 0, nickname: "Alice" })).toThrow();
  });

  it("RoomReadyChangedEventSchema requires seat/ready", () => {
    expect(RoomReadyChangedEventSchema.parse({ seat: 1, ready: true })).toEqual({
      seat: 1,
      ready: true,
    });
  });

  it("RoomScoreUpdatedEventSchema requires a 4-tuple of scores", () => {
    expect(() => RoomScoreUpdatedEventSchema.parse({ scores: [0, 0, 0], gameNumber: 1 })).toThrow();
  });

  it("RoomDealerChangedEventSchema rejects an out-of-range seat", () => {
    expect(() => RoomDealerChangedEventSchema.parse({ dealer: 4, gameNumber: 1 })).toThrow();
  });

  it("RoomSessionFinishedEventSchema requires a valid SessionResult", () => {
    const payload = {
      result: { winner: 0 as const, ranking: [], format: "4-round" as const, gamesPlayed: 4 },
    };
    expect(RoomSessionFinishedEventSchema.parse(payload)).toEqual(payload);
  });
});

describe("EventVisibilitySchema", () => {
  it("accepts public and seat-scoped visibility", () => {
    expect(EventVisibilitySchema.parse({ type: "public" })).toEqual({ type: "public" });
    expect(EventVisibilitySchema.parse({ type: "seat", seats: [0, 2] })).toEqual({
      type: "seat",
      seats: [0, 2],
    });
  });

  it("rejects an unknown visibility type", () => {
    expect(() => EventVisibilitySchema.parse({ type: "private" })).toThrow();
  });
});

describe("GameEventEnvelopeSchema", () => {
  it("validates the envelope but leaves payload opaque", () => {
    const payload = {
      event: { seq: 1, visibility: { type: "public" as const }, payload: { anything: true } },
    };
    expect(GameEventEnvelopeSchema.parse(payload)).toEqual(payload);
  });

  it("rejects a missing seq", () => {
    expect(() =>
      GameEventEnvelopeSchema.parse({ event: { visibility: { type: "public" }, payload: {} } }),
    ).toThrow();
  });
});

describe("GameSnapshotSchema / PlayerViewBaseSchema", () => {
  it("validates the public skeleton while allowing ruleset-private extra fields", () => {
    const payload = {
      view: {
        seat: 0 as const,
        hand: [1, 2, 3],
        seats: [{ handCount: 13 }, { handCount: 13 }, { handCount: 13 }, { handCount: 13 }],
        wallCount: 40,
        currentSeat: 0 as const,
        phase: "playing", // ruleset-private field, must pass through via catchall
      },
      seq: 5,
    };
    expect(GameSnapshotSchema.parse(payload)).toEqual(payload);
  });

  it("rejects a view missing the common skeleton", () => {
    expect(() => PlayerViewBaseSchema.parse({ seat: 0, hand: [] })).toThrow();
  });
});

describe("ERROR_CODES", () => {
  it("matches the docs/protocol.md §4 enum exactly", () => {
    expect(ERROR_CODES).toEqual([
      "UNAUTHORIZED",
      "VERSION_MISMATCH",
      "ROOM_NOT_FOUND",
      "ROOM_FULL",
      "ALREADY_IN_ROOM",
      "NOT_IN_ROOM",
      "GAME_IN_PROGRESS",
      "GAME_NOT_STARTED",
      "NOT_YOUR_TURN",
      "ILLEGAL_ACTION",
      "INVALID_CONFIG",
      "INTERNAL",
    ]);
  });
});
