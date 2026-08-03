import { afterEach, describe, expect, it } from "vitest";
import type { PlayerViewBase } from "@new-mj/protocol";
import {
  handVisualTokens,
  registerHandVisualSnapshot,
  resetHandVisualLedger,
} from "./handVisualLedger";

afterEach(resetHandVisualLedger);

describe("handVisualLedger", () => {
  it("initialises concealed tokens from the first snapshot without scheduling an animation", () => {
    const firstSnapshot = {
      seat: 0,
      hand: [1, 2, 3],
      seats: [{ handCount: 3 }, { handCount: 13 }, { handCount: 13 }, { handCount: 13 }],
    } as unknown as PlayerViewBase;

    registerHandVisualSnapshot(null, firstSnapshot, 0, 1);

    expect(handVisualTokens(1, [], false).map((token) => token.key)).toEqual([
      "back:1:0",
      "back:1:1",
      "back:1:2",
      "back:1:3",
      "back:1:4",
      "back:1:5",
      "back:1:6",
      "back:1:7",
      "back:1:8",
      "back:1:9",
      "back:1:10",
      "back:1:11",
      "back:1:12",
    ]);
  });

  it("keeps token identities opaque when a debug hand was registered but the seat is hidden", () => {
    const snapshot = {
      seat: 0,
      hand: [1, 2, 3],
      seats: [{ handCount: 3 }, { handCount: 3 }, { handCount: 13 }, { handCount: 13 }],
    } as unknown as PlayerViewBase;

    const debugHands = [[], [44, 48, 52], [], []];
    registerHandVisualSnapshot(null, snapshot, 0, 1, debugHands, debugHands);

    expect(handVisualTokens(1, [44, 48, 52], false)).toEqual([
      { key: "back:1:0" },
      { key: "back:1:1" },
      { key: "back:1:2" },
    ]);
  });

  it("never reuses a concealed token key after a middle discard and later draw", () => {
    const snapshot = (handCount: number, discardCount: number) =>
      ({
        seat: 0,
        hand: [1, 2, 3],
        seats: [
          { handCount: 3, discards: [] },
          { handCount, discards: Array.from({ length: discardCount }) },
          { handCount: 13, discards: [] },
          { handCount: 13, discards: [] },
        ],
      }) as unknown as PlayerViewBase;
    const initial = snapshot(14, 0);
    const afterDiscard = snapshot(13, 1);
    const afterDraw = snapshot(14, 1);

    registerHandVisualSnapshot(null, initial, 0, 1);
    registerHandVisualSnapshot(initial, afterDiscard, 0, 1);
    registerHandVisualSnapshot(afterDiscard, afterDraw, 0, 1);

    const keys = handVisualTokens(1, [], false).map((token) => token.key);
    expect(keys).toHaveLength(14);
    expect(new Set(keys)).toHaveLength(keys.length);
    expect(keys).toContain("back:1:14");
  });
});
