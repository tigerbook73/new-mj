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
    // The pinned drawn slot keys by the actual TileId so a new draw remounts
    // it (see SeatContent.drawnSlotKey); whether it plays an entry animation
    // is now decided by animationLedger, not here — see drawnSlotLedgerKey,
    // a fixed per-seat lane key (gameNumber defaults to 1).
    expect(presentation.seats.bottom.drawnSlotKey).toBe("own-3");
    expect(presentation.seats.bottom.drawnSlotLedgerKey).toBe("g1:draw:own:0");
    expect(presentation.seats.right.drawnSlotKey).toBe("none");
    expect(presentation.seats.right.drawnSlotLedgerKey).toBe("g1:draw:opp:1");
    expect(presentation.discards.right[0]).toMatchObject({
      tile: 9,
      justDiscarded: true,
      // Whether this discard plays an entry animation is now decided by
      // animationLedger (see useSlotEntering) — this is just the fixed
      // seat+index key it reads by, not the entering flag itself.
      discardLedgerKey: "g1:discard:1:0",
    });
    // A regular hand tile and the pinned just-drawn tile both discard through the same callback.
    presentation.seats.bottom.onDiscard?.(1);
    presentation.seats.bottom.onDiscard?.(3);
    expect(onDiscard).toHaveBeenNthCalledWith(1, 1);
    expect(onDiscard).toHaveBeenNthCalledWith(2, 3);
  });

  it("keys each meld by seat+index+tileCount, matching diffPlayerView's meld key exactly", () => {
    const view = {
      seat: 0,
      hand: [1, 2],
      wallCount: 80,
      currentSeat: 0,
      phase: "playing",
      myActionOptions: [],
      seats: [
        {
          handCount: 2,
          melds: [{ type: "anGang", tiles: [1, 1, 1] }],
          discards: [],
          justDrawn: false,
        },
        {
          handCount: 13,
          melds: [{ type: "peng", tiles: [5, 5, 5], from: 0 }],
          discards: [],
          justDrawn: false,
        },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
      ],
    } as unknown as PlayerViewBase;

    const presentation = useTablePresentation({
      view,
      players: [{ nickname: "Me" }, null, null, null],
      onDiscard: vi.fn(),
      gameNumber: 2,
    });
    if (!presentation) throw new Error("missing presentation");

    expect(presentation.seats.bottom.melds[0]).toMatchObject({ meldLedgerKey: "g2:meld:0:0:3" });
    // A meld claimed from my discard: fromDirection is derived (see meld.from), meldLedgerKey stays seat+index+tileCount only.
    expect(presentation.seats.right.melds[0]).toMatchObject({
      fromDirection: "bottom",
      meldLedgerKey: "g2:meld:1:0:3",
    });
  });

  it("keys each discard entry by seat+index, stable regardless of which one is most recent", () => {
    const view = {
      seat: 0,
      hand: [1, 2],
      wallCount: 80,
      currentSeat: 1,
      phase: "playing",
      myActionOptions: [],
      lastDiscard: { seat: 1, tile: 9 },
      seats: [
        { handCount: 2, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [{ tile: 5 }, { tile: 9 }], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
      ],
    } as unknown as PlayerViewBase;

    const presentation = useTablePresentation({
      view,
      players: [{ nickname: "Me" }, null, null, null],
      onDiscard: vi.fn(),
      gameNumber: 3,
    });
    if (!presentation) throw new Error("missing presentation");

    expect(presentation.discards.right[0]).toMatchObject({
      tile: 5,
      discardLedgerKey: "g3:discard:1:0",
    });
    expect(presentation.discards.right[1]).toMatchObject({
      tile: 9,
      justDiscarded: true,
      discardLedgerKey: "g3:discard:1:1",
    });
  });

  it("keys an opponent's pinned drawn slot by seat+handCount (no real TileId to key by)", () => {
    const view = {
      seat: 0,
      hand: [1, 2],
      wallCount: 80,
      currentSeat: 1,
      phase: "playing",
      myActionOptions: [],
      seats: [
        { handCount: 2, melds: [], discards: [], justDrawn: false },
        { handCount: 14, melds: [], discards: [], justDrawn: true },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
      ],
    } as unknown as PlayerViewBase;

    const presentation = useTablePresentation({
      view,
      players: [{ nickname: "Me" }, null, null, null],
      onDiscard: vi.fn(),
    });
    if (!presentation) throw new Error("missing presentation");

    expect(presentation.seats.right.drawnSlotKey).toBe("opp-1-14");
    expect(presentation.seats.right.drawnSlotLedgerKey).toBe("g1:draw:opp:1");
    expect(presentation.seats.bottom.drawnSlotKey).toBe("none");
    expect(presentation.seats.bottom.drawnSlotLedgerKey).toBe("g1:draw:own:0");
  });

  it("hides the action dock during awaiting-draw (draw is server-auto-submitted, never clickable)", () => {
    const view = {
      seat: 0,
      hand: [1, 2, 3],
      wallCount: 80,
      currentSeat: 0,
      phase: "awaiting-draw",
      myActionOptions: [{ type: "draw" }],
      seats: [
        { handCount: 3, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
      ],
    } as unknown as PlayerViewBase;

    const presentation = useTablePresentation({
      view,
      players: [{ nickname: "Me" }, null, null, null],
      onDiscard: vi.fn(),
    });
    if (!presentation) throw new Error("missing presentation");

    expect(presentation.hasDockActions).toBe(false);
  });
});
