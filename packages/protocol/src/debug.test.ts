import { describe, expect, it } from "vitest";
import { DebugOmniscientViewSchema, DebugReplayOmniscientViewRequestSchema } from "./debug.ts";

describe("DebugOmniscientViewSchema", () => {
  it("accepts a wall, per-seat hands, and per-seat-per-meld tiles as raw TileId arrays", () => {
    const data = {
      wall: [1, 2, 3],
      hands: [[4, 5], [], [6], [7, 8, 9]],
      melds: [[[10, 11, 12, 13]], [], [], []],
    };
    expect(DebugOmniscientViewSchema.parse(data)).toEqual(data);
  });

  it("rejects non-numeric tile ids", () => {
    expect(() =>
      DebugOmniscientViewSchema.parse({ wall: ["1m"], hands: [], melds: [] }),
    ).toThrow();
  });

  it("rejects a missing melds field", () => {
    expect(() => DebugOmniscientViewSchema.parse({ wall: [], hands: [] })).toThrow();
  });
});

describe("DebugReplayOmniscientViewRequestSchema", () => {
  it("accepts a gameNumber (scoped to the connection's current room)", () => {
    const data = { gameNumber: 2 };
    expect(DebugReplayOmniscientViewRequestSchema.parse(data)).toEqual(data);
  });

  it("rejects a missing gameNumber", () => {
    expect(() => DebugReplayOmniscientViewRequestSchema.parse({})).toThrow();
  });
});
