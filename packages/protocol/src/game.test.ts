import { describe, expect, it } from "vitest";
import {
  EventVisibilitySchema,
  GameEventEnvelopeSchema,
  GameSnapshotSchema,
  PlayerViewBaseSchema,
} from "./game.ts";

describe("EventVisibilitySchema", () => {
  it("accepts public and seat-scoped visibility", () => {
    expect(EventVisibilitySchema.parse({ type: "public" })).toEqual({ type: "public" });
    expect(EventVisibilitySchema.parse({ type: "seat", seats: [0, 2] })).toEqual({
      type: "seat",
      seats: [0, 2],
    });
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

  it("requires event sequence and valid visibility", () => {
    expect(() =>
      GameEventEnvelopeSchema.parse({ event: { visibility: { type: "public" }, payload: {} } }),
    ).toThrow();
    expect(() =>
      GameEventEnvelopeSchema.parse({
        event: { seq: 1, visibility: { type: "private" }, payload: {} },
      }),
    ).toThrow();
  });
});

describe("GameSnapshotSchema and PlayerViewBaseSchema", () => {
  it("validates the common skeleton while allowing ruleset-private fields", () => {
    const payload = {
      view: {
        seat: 0 as const,
        hand: [1, 2, 3],
        seats: [{ handCount: 13 }, { handCount: 13 }, { handCount: 13 }, { handCount: 13 }],
        wallCount: 40,
        currentSeat: 0 as const,
        phase: "playing",
      },
      seq: 5,
    };
    expect(GameSnapshotSchema.parse(payload)).toEqual(payload);
    expect(() => PlayerViewBaseSchema.parse({ seat: 0, hand: [] })).toThrow();
  });
});
