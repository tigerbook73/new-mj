import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSlot } from "./animationLedger";
import type { PlayerViewBase } from "@new-mj/protocol";
import {
  registerTableSnapshotAnimation,
  resetTableAnimationRuntime,
  tableAnimationMetadata,
} from "./tableAnimationCoordinator";

afterEach(resetTableAnimationRuntime);

describe("tableAnimationCoordinator", () => {
  it("initialises hidden hand tracks without requiring presentation to read a ledger", () => {
    const view = {
      seat: 0,
      hand: [1, 2, 3],
      seats: [{ handCount: 3 }, { handCount: 13 }, { handCount: 13 }, { handCount: 13 }],
    } as unknown as PlayerViewBase;

    registerTableSnapshotAnimation({
      previousSeq: null,
      nextSeq: 1,
      previousView: null,
      nextView: view,
      seat: 0,
      gameNumber: 1,
      enabled: true,
    });

    expect(tableAnimationMetadata().handTracks.get(1)?.tokens[0]).toEqual({ key: "back:1:0" });
  });

  it("registers an incremental discard and preserves God-mode identities", () => {
    const before = {
      seat: 0,
      hand: [1, 2, 3],
      seats: [
        { handCount: 3, discards: [] },
        { handCount: 3, discards: [] },
      ],
    } as unknown as PlayerViewBase;
    const after = {
      ...before,
      seats: [
        { handCount: 3, discards: [] },
        { handCount: 2, discards: [{ tile: 8 }] },
      ],
    } as unknown as PlayerViewBase;

    registerTableSnapshotAnimation({
      previousSeq: 1,
      nextSeq: 2,
      previousView: before,
      nextView: after,
      seat: 0,
      gameNumber: 1,
      enabled: true,
      previousGodHands: [[], [4, 8, 12]],
      nextGodHands: [[], [4, 12]],
    });

    expect(resolveSlot("g1:discard:1:0")).toBe("flight");
    expect(tableAnimationMetadata().handTracks.get(1)?.tokens).toEqual([
      { key: "tile:4", tileId: 4 },
      { key: "tile:12", tileId: 12 },
    ]);
  });

  it("captures an auto-discard source rect before the snapshot is applied", () => {
    const rect = { left: 1 } as DOMRect;
    vi.stubGlobal("document", {
      querySelector: vi.fn(() => ({ getBoundingClientRect: () => rect })),
    });
    const before = {
      seat: 0,
      hand: [7],
      seats: [{ handCount: 1, discards: [] }],
    } as unknown as PlayerViewBase;
    const after = {
      ...before,
      hand: [],
      seats: [{ handCount: 0, discards: [{ tile: 7 }] }],
    } as unknown as PlayerViewBase;

    expect(
      registerTableSnapshotAnimation({
        previousSeq: 1,
        nextSeq: 2,
        previousView: before,
        nextView: after,
        seat: 0,
        gameNumber: 1,
        enabled: true,
      }).autoDiscardOrigin,
    ).toEqual({ tile: 7, rect });
    vi.unstubAllGlobals();
  });
});
