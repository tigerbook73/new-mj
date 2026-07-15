import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  GameActionRequestSchema,
  RoomCreateRequestSchema,
  RoomInfoSchema,
  RoomJoinRequestSchema,
  RoomReadyRequestSchema,
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
      "NOT_YOUR_TURN",
      "ILLEGAL_ACTION",
      "INVALID_CONFIG",
      "INTERNAL",
    ]);
  });
});
