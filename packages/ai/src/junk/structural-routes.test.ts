import { tileIdOf, type JunkPlayerView, type TileKind } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { evaluateStructuralRoutes } from "./structural-routes.ts";

const ids = (kinds: readonly TileKind[]) => {
  const copies = new Map<TileKind, number>();
  return kinds.map((kind) => {
    const copy = copies.get(kind) ?? 0;
    copies.set(kind, copy + 1);
    return tileIdOf(kind, copy);
  });
};

const hand = ids(["1m", "1m", "2m", "2m", "3p", "3p", "4p", "4p", "5s", "5s", "6s", "6s", "7z"]);
const view: JunkPlayerView = {
  seat: 0,
  hand,
  wallCount: 50,
  currentSeat: 0,
  dealer: 0,
  phase: "playing",
  seats: [0, 1, 2, 3].map(() => ({ handCount: 13, melds: [], discards: [], justDrawn: false })),
};

describe("structural hand routes", () => {
  it("selects an explicit six-pairs tenpai route without weights", () => {
    const result = evaluateStructuralRoutes(view, hand, 0);
    expect(result.selectedRoute).toBe("sevenPairs");
    expect(result.sevenPairs).toEqual({
      standardShanten: 0,
      liveImprovingKindCount: 1,
      liveImprovingTileCount: 3,
    });
  });

  it("disables seven pairs after a meld", () => {
    expect(evaluateStructuralRoutes(view, hand.slice(3), 1)).toMatchObject({
      selectedRoute: "standard",
      sevenPairs: null,
    });
  });
});
