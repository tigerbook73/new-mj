import { describe, expect, it } from "vitest";
import {
  initialiseHandVisualTrack,
  reconcileHandVisualTrack,
} from "./handVisualTrack";

describe("handVisualTrack", () => {
  it("removes a stable hidden token and never reuses it after a later draw", () => {
    const initial = initialiseHandVisualTrack(1, undefined, 14);
    const afterDiscard = reconcileHandVisualTrack({
      seat: 1,
      existing: initial,
      prevCount: 14,
      nextCount: 13,
      prevDiscardCount: 0,
      nextDiscardCount: 1,
    });
    const afterDraw = reconcileHandVisualTrack({
      seat: 1,
      existing: afterDiscard.track,
      prevCount: 13,
      nextCount: 14,
      prevDiscardCount: 1,
      nextDiscardCount: 1,
    });

    expect(afterDiscard.removed?.key).toMatch(/^back:1:/);
    expect(afterDraw.track.tokens.map((token) => token.key)).toContain("back:1:14");
  });

  it("uses a missing known TileId as the discarded token", () => {
    const result = reconcileHandVisualTrack({
      seat: 1,
      existing: initialiseHandVisualTrack(1, [4, 8, 12], 3),
      prevKnown: [4, 8, 12],
      nextKnown: [4, 12],
      prevCount: 3,
      nextCount: 2,
      prevDiscardCount: 0,
      nextDiscardCount: 1,
    });

    expect(result.removed).toEqual({ key: "tile:8", tileId: 8 });
    expect(result.track.tokens.map((token) => token.key)).toEqual(["tile:4", "tile:12"]);
  });
});
