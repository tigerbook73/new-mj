import type { PlayerViewBase } from "@new-mj/protocol";
import { describe, expect, it, vi } from "vitest";
import { useTablePresentation } from "./useTablePresentation";

describe("useTablePresentation", () => {
  it("keeps the just-drawn tile separate and maps legal actions to the dock", () => {
    const onDiscard = vi.fn();
    const view = {
      seat: 0,
      hand: [1, 2, 3],
      wallCount: 80,
      currentSeat: 0,
      phase: "playing",
      justDrawn: 3,
      myActionOptions: [
        { type: "discard", tile: 1 },
        { type: "anGang", kind: "1m" },
      ],
      lastDiscard: { seat: 1, tile: 9 },
      seats: [
        { handCount: 3, melds: [], discards: [], justDrawn: true },
        { handCount: 13, melds: [], discards: [{ tile: 9 }], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
      ],
    } as unknown as PlayerViewBase;

    const presentation = useTablePresentation({
      view,
      players: [{ nickname: "Me" }, null, null, null],
      onDiscard,
    });
    if (!presentation) throw new Error("missing presentation");

    expect(presentation.hasDockActions).toBe(true);
    expect(presentation.seats.bottom.hand).toEqual([1, 2]);
    expect(presentation.seats.bottom.handCount).toBe(2);
    expect(presentation.seats.bottom.justDrawn).toMatchObject({ visible: true, tileId: 3 });
    expect(presentation.discards.right[0]).toMatchObject({ tile: 9, justDiscarded: true });
    presentation.seats.bottom.onDiscard?.(1);
    presentation.seats.bottom.justDrawn.onClick?.();
    expect(onDiscard).toHaveBeenNthCalledWith(1, 1);
    expect(onDiscard).toHaveBeenNthCalledWith(2, 3);
  });
});
