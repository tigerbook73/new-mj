import { describe, expect, it } from "vitest";
import { ReplayGetRequestSchema, ReplayGetResponseSchema } from "./replay.ts";

describe("ReplayGetRequestSchema", () => {
  it("accepts a roomId + gameNumber pair", () => {
    const data = { roomId: "room-1", gameNumber: 2 };
    expect(ReplayGetRequestSchema.parse(data)).toEqual(data);
  });

  it("rejects a missing gameNumber", () => {
    expect(() => ReplayGetRequestSchema.parse({ roomId: "room-1" })).toThrow();
  });
});

describe("ReplayGetResponseSchema", () => {
  it("accepts a final view plus a seat-filtered event stream", () => {
    const data = {
      gameNumber: 1,
      finalView: {
        seat: 0,
        hand: [1, 2, 3],
        seats: [{ handCount: 0 }, { handCount: 13 }, { handCount: 13 }, { handCount: 13 }],
        wallCount: 20,
        currentSeat: 0,
      },
      events: [{ seq: 1, visibility: { type: "public" }, payload: { type: "GameStarted" } }],
    };
    expect(ReplayGetResponseSchema.parse(data)).toEqual(data);
  });
});
