import { describe, expect, it } from "vitest";
import {
  PlayerSchema,
  RoomInfoSchema,
  RoomParticipantSchema,
  RoomSummarySchema,
  SessionResultSchema,
} from "./room-models.ts";

const validPlayer = {
  userId: "user-1",
  seatId: 0 as const,
  nickname: "Alice",
  isBot: false,
  isReady: true,
};

const validRoomInfo = {
  id: "room-1",
  name: "Test Room",
  ownerUserId: "owner-1",
  owner: "Owner",
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

describe("PlayerSchema and RoomParticipantSchema", () => {
  it("accepts a seated player and an unseated participant", () => {
    expect(PlayerSchema.parse(validPlayer)).toEqual(validPlayer);
    const participant = {
      userId: "user-1",
      nickname: "Alice",
      isSeated: true,
      isBot: false,
    };
    expect(RoomParticipantSchema.parse(participant)).toEqual(participant);
  });

  it("requires the participant presence fields", () => {
    expect(() => RoomParticipantSchema.parse({ userId: "user-1", nickname: "Alice" })).toThrow();
  });
});

describe("RoomInfoSchema", () => {
  it("accepts a minimal valid room snapshot", () => {
    expect(RoomInfoSchema.parse(validRoomInfo)).toEqual(validRoomInfo);
  });

  it("rejects an invalid dealer or players tuple length", () => {
    expect(() => RoomInfoSchema.parse({ ...validRoomInfo, dealer: 4 })).toThrow();
    expect(() => RoomInfoSchema.parse({ ...validRoomInfo, players: [null, null, null] })).toThrow();
  });

  it("requires name and accepts optional participants/result fields", () => {
    const { name: _drop, ...withoutName } = validRoomInfo;
    expect(() => RoomInfoSchema.parse(withoutName)).toThrow();
    const withExtras = {
      ...validRoomInfo,
      participants: [{ userId: "user-1", nickname: "Alice", isSeated: true, isBot: false }],
      result: { winner: 0 as const, ranking: [], format: "4-round" as const, gamesPlayed: 1 },
    };
    expect(RoomInfoSchema.parse(withExtras)).toEqual(withExtras);
  });
});

describe("RoomSummarySchema and SessionResultSchema", () => {
  it("validates a lobby summary", () => {
    const summary = {
      id: "room-1",
      name: "Test Room",
      rulesetId: "junk",
      creator: "Alice",
      createdAt: 1,
      playerCount: 2,
      status: "open" as const,
    };
    expect(RoomSummarySchema.parse(summary)).toEqual(summary);
    expect(() => RoomSummarySchema.parse({ ...summary, playerCount: "2" })).toThrow();
  });

  it("requires valid ranking entries in a session result", () => {
    const result = {
      winner: 0 as const,
      ranking: [{ seatId: 1 as const, score: 10 }],
      format: "4-round" as const,
      gamesPlayed: 4,
    };
    expect(SessionResultSchema.parse(result)).toEqual(result);
    expect(() =>
      SessionResultSchema.parse({ ...result, ranking: [{ seatId: 4, score: 10 }] }),
    ).toThrow();
  });
});
