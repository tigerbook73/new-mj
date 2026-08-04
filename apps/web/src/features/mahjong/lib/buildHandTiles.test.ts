import { describe, expect, it } from "vitest";
import { buildHandTiles } from "./buildHandTiles";

describe("buildHandTiles", () => {
  it("bottom seat: sorts the rest of the hand and pins the just-drawn tile after a gap", () => {
    // 36=1p, 0=1m, 4=2m, 8=3m (see mahjongTiles.ts TILE_KINDS) — 8 is the just-drawn tile.
    const result = buildHandTiles({
      direction: "bottom",
      hand: [36, 0, 4, 8],
      myJustDrawnTile: 8,
      godHand: undefined,
      handCount: 4,
      seatJustDrawn: false,
      highlightCaishen: false,
    });
    expect(result.handTiles).toEqual([0, 4, 36, -1, 8]);
    expect(result.drawnVisible).toBe(true);
    expect(result.godDrawnTile).toBeUndefined();
  });

  it("bottom seat with no just-drawn tile: trailing slot is an empty gap, not a tile", () => {
    const result = buildHandTiles({
      direction: "bottom",
      hand: [0, 4],
      myJustDrawnTile: undefined,
      godHand: undefined,
      handCount: 2,
      seatJustDrawn: false,
      highlightCaishen: false,
    });
    expect(result.handTiles).toEqual([0, 4, -1, -1]);
    expect(result.drawnVisible).toBe(false);
  });

  it("bottom seat with highlightCaishen: caishen tiles lead, separated by a gap from the rest", () => {
    // 124 = 5z (white dragon / caishen, ids 124-127 — see mahjongTiles.ts isCaishenTile).
    const result = buildHandTiles({
      direction: "bottom",
      hand: [36, 124, 0, 4, 8],
      myJustDrawnTile: 8,
      godHand: undefined,
      handCount: 5,
      seatJustDrawn: false,
      highlightCaishen: true,
    });
    expect(result.handTiles).toEqual([124, -1, 0, 4, 36, -1, 8]);
  });

  it("opponent seat in god mode: renders the real hand, drawn tile pinned from godHand's last entry", () => {
    // 10=3m, 50=4p; godHand's last entry is the most recent draw by convention
    // (junk/state-machine.ts's hand.push() invariant — see useTablePresentation.ts).
    const result = buildHandTiles({
      direction: "right",
      hand: [],
      myJustDrawnTile: undefined,
      godHand: [50, 10, 90],
      handCount: 3,
      seatJustDrawn: true,
      highlightCaishen: false,
    });
    expect(result.handTiles).toEqual([10, 50, -1, 90]);
    expect(result.drawnVisible).toBe(true);
    expect(result.godDrawnTile).toBe(90);
  });

  it("redacted opponent seat with a pending draw: filler tiles plus a pinned drawn slot", () => {
    const result = buildHandTiles({
      direction: "left",
      hand: [],
      myJustDrawnTile: undefined,
      godHand: undefined,
      handCount: 5,
      seatJustDrawn: true,
      highlightCaishen: false,
    });
    expect(result.handTiles).toEqual([0, 0, 0, 0, -1, 0]);
    expect(result.drawnVisible).toBe(true);
    expect(result.godDrawnTile).toBeUndefined();
  });

  it("redacted opponent seat with no pending draw: no pinned slot, just filler and a trailing gap", () => {
    const result = buildHandTiles({
      direction: "top",
      hand: [],
      myJustDrawnTile: undefined,
      godHand: undefined,
      handCount: 3,
      seatJustDrawn: false,
      highlightCaishen: false,
    });
    expect(result.handTiles).toEqual([0, 0, 0, -1, -1]);
    expect(result.drawnVisible).toBe(false);
  });
});
