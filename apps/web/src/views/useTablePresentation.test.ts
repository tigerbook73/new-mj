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
    // Rest of the hand, then always exactly two trailing slots: an empty gap (-1), then the
    // pinned just-drawn tile (3) — see SeatContent.handTiles.
    expect(presentation.seats.bottom.handTiles).toEqual([1, 2, -1, 3]);
    expect(presentation.seats.bottom.revealed).toBe(true);
    expect(presentation.discards.right[0]).toMatchObject({ tile: 9, justDiscarded: true });
    // A regular hand tile and the pinned just-drawn tile both discard through the same callback.
    presentation.seats.bottom.onDiscard?.(1);
    presentation.seats.bottom.onDiscard?.(3);
    expect(onDiscard).toHaveBeenNthCalledWith(1, 1);
    expect(onDiscard).toHaveBeenNthCalledWith(2, 3);
  });
});
