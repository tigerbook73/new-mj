import { describe, expect, it } from "vitest";
import {
  RoomClosedEventSchema,
  RoomDealerChangedEventSchema,
  RoomParticipantJoinedEventSchema,
  RoomParticipantLeftEventSchema,
  RoomPlayerJoinedEventSchema,
  RoomPlayerLeftEventSchema,
  RoomReadyChangedEventSchema,
  RoomScoreUpdatedEventSchema,
  RoomSessionFinishedEventSchema,
} from "./room-events.ts";

describe("room membership events", () => {
  it("validates player and participant join/leave events", () => {
    expect(RoomPlayerJoinedEventSchema.parse({ seat: 0, nickname: "Alice", isBot: false })).toEqual(
      { seat: 0, nickname: "Alice", isBot: false },
    );
    expect(
      RoomParticipantJoinedEventSchema.parse({
        participant: { userId: "u1", nickname: "Alice", isSeated: true, isBot: false },
      }),
    ).toBeTruthy();
    expect(RoomParticipantLeftEventSchema.parse({ userId: "u1" })).toEqual({ userId: "u1" });
    expect(RoomPlayerLeftEventSchema.parse({ seat: 2 })).toEqual({ seat: 2 });
    expect(() => RoomPlayerJoinedEventSchema.parse({ seat: 0, nickname: "Alice" })).toThrow();
    expect(() => RoomPlayerLeftEventSchema.parse({ seat: 4 })).toThrow();
  });
});

describe("room state events", () => {
  it("validates ready, score, dealer, and session-finished payloads", () => {
    expect(RoomReadyChangedEventSchema.parse({ seat: 1, ready: true })).toEqual({
      seat: 1,
      ready: true,
    });
    expect(RoomScoreUpdatedEventSchema.parse({ scores: [0, 1, 2, 3], gameNumber: 2 })).toBeTruthy();
    expect(RoomDealerChangedEventSchema.parse({ dealer: 0, gameNumber: 1 })).toEqual({
      dealer: 0,
      gameNumber: 1,
    });
    expect(
      RoomSessionFinishedEventSchema.parse({
        result: { winner: 0, ranking: [], format: "4-round", gamesPlayed: 4 },
      }),
    ).toBeTruthy();
    expect(() => RoomScoreUpdatedEventSchema.parse({ scores: [0, 0, 0], gameNumber: 1 })).toThrow();
    expect(() => RoomDealerChangedEventSchema.parse({ dealer: 4, gameNumber: 1 })).toThrow();
  });
});

describe("RoomClosedEventSchema", () => {
  it("accepts only documented close reasons", () => {
    expect(RoomClosedEventSchema.parse({ reason: "hostLeft" })).toEqual({ reason: "hostLeft" });
    expect(RoomClosedEventSchema.parse({ reason: "allPlayersLeft" })).toEqual({
      reason: "allPlayersLeft",
    });
    expect(() => RoomClosedEventSchema.parse({ reason: "somethingElse" })).toThrow();
  });
});
