import { describe, expect, it } from "vitest";
import { DebugOmniscientViewSchema } from "./debug.ts";

describe("DebugOmniscientViewSchema", () => {
  it("accepts a wall and per-seat hands as raw TileId arrays", () => {
    const data = { wall: [1, 2, 3], hands: [[4, 5], [], [6], [7, 8, 9]] };
    expect(DebugOmniscientViewSchema.parse(data)).toEqual(data);
  });

  it("rejects non-numeric tile ids", () => {
    expect(() => DebugOmniscientViewSchema.parse({ wall: ["1m"], hands: [] })).toThrow();
  });
});
