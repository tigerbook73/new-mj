import type { DebugOmniscientView, PlayerViewBase } from "@new-mj/protocol";
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

  it("hangzhou: groups the caishen tile at the front, set off by a gap from the rest of the hand", () => {
    const view = {
      seat: 0,
      hand: [0, 4, 124], // 1m, 2m, 5z (caishen)
      wallCount: 80,
      currentSeat: 0,
      phase: "playing",
      myActionOptions: [],
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
      rulesetId: "hangzhou",
    });
    if (!presentation) throw new Error("missing presentation");

    // caishen (124) first, then a gap, then the rest sorted, then the usual
    // trailing gap + empty drawn slot (nobody just drew here).
    expect(presentation.seats.bottom.handTiles).toEqual([124, -1, 0, 4, -1, -1]);
  });

  it("non-hangzhou: a 5z tile is just an ordinary honor, sorted in its normal place", () => {
    const view = {
      seat: 0,
      hand: [0, 4, 124],
      wallCount: 80,
      currentSeat: 0,
      phase: "playing",
      myActionOptions: [],
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
      // no rulesetId — matches junk/bloodbattle, which never send a caishen concept
    });
    if (!presentation) throw new Error("missing presentation");

    expect(presentation.seats.bottom.handTiles).toEqual([0, 4, 124, -1, -1]);
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

  describe("god mode (godView)", () => {
    const baseView = {
      seat: 0,
      hand: [1, 2],
      wallCount: 80,
      currentSeat: 0,
      phase: "playing",
      myActionOptions: [],
      seats: [
        { handCount: 2, melds: [], discards: [], justDrawn: false },
        // seat 1 -> "right": just drew, has a redacted anGang (tiles: []).
        { handCount: 4, melds: [{ type: "anGang", tiles: [] }], discards: [], justDrawn: true },
        // seat 2 -> "top", seat 3 -> "left": neither just drew.
        { handCount: 3, melds: [], discards: [], justDrawn: false },
        { handCount: 3, melds: [], discards: [], justDrawn: false },
      ],
    } as unknown as PlayerViewBase;

    const godView: DebugOmniscientView = {
      wall: [],
      hands: [
        [],
        [0, 4, 8, 12], // seat 1: hand.push() puts the just-drawn tile (12) last.
        [16, 20, 24],
        [28, 32, 36],
      ],
      melds: [[], [[100, 101, 102, 103]], [], []],
    };

    it("reveals an opponent seat and pins the last god-hand entry as the drawn tile, like bottom's own justDrawn", () => {
      const presentation = useTablePresentation({
        view: baseView,
        players: [{ nickname: "Me" }, null, null, null],
        onDiscard: vi.fn(),
        godView,
      });
      if (!presentation) throw new Error("missing presentation");

      expect(presentation.seats.right.revealed).toBe(true);
      // Rest of the god hand sorted, gap, then the pinned last (most recently
      // pushed) tile — same shape as bottom's own handTiles.
      expect(presentation.seats.right.handTiles).toEqual([0, 4, 8, -1, 12]);
      expect(presentation.seats.right.drawnSlotKey).toBe("god-1-12");
    });

    it("fills in an anGang's redacted tiles from godView.melds, keyed by the original (pre-fill) tile count", () => {
      const presentation = useTablePresentation({
        view: baseView,
        players: [{ nickname: "Me" }, null, null, null],
        onDiscard: vi.fn(),
        godView,
        gameNumber: 1,
      });
      if (!presentation) throw new Error("missing presentation");

      expect(presentation.seats.right.melds[0]).toMatchObject({
        tiles: [100, 101, 102, 103],
        meldLedgerKey: "g1:meld:1:0:0",
      });
    });

    it("keeps opponent draw animation and four-seat reflow enabled", () => {
      const presentation = useTablePresentation({
        view: baseView,
        players: [{ nickname: "Me" }, null, null, null],
        onDiscard: vi.fn(),
        godView,
      });
      if (!presentation) throw new Error("missing presentation");

      expect(presentation.seats.bottom.reflow).toBe(true);
      expect(presentation.seats.bottom.animateDraw).toBe(true);
      expect(presentation.seats.top.revealed).toBe(true);
      expect(presentation.seats.top.reflow).toBe(true);
      expect(presentation.seats.top.animateDraw).toBe(true);
      expect(presentation.seats.right.revealed).toBe(true);
      expect(presentation.seats.right.reflow).toBe(true);
      expect(presentation.seats.right.animateDraw).toBe(true);
      expect(presentation.seats.left.revealed).toBe(true);
      expect(presentation.seats.left.reflow).toBe(true);
      expect(presentation.seats.left.animateDraw).toBe(true);
    });

    it("leaves opponents unrevealed while still enabling visual-token reflow", () => {
      const presentation = useTablePresentation({
        view: baseView,
        players: [{ nickname: "Me" }, null, null, null],
        onDiscard: vi.fn(),
      });
      if (!presentation) throw new Error("missing presentation");

      expect(presentation.seats.bottom.reflow).toBe(true);
      expect(presentation.seats.right.revealed).toBe(false);
      expect(presentation.seats.right.reflow).toBe(true);
    });
  });

  it("marks only the dealer's own seat direction as isDealer, regardless of viewing seat", () => {
    const view = {
      seat: 1,
      hand: [1, 2, 3],
      wallCount: 80,
      currentSeat: 0,
      phase: "playing",
      seats: [
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 3, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
      ],
    } as unknown as PlayerViewBase;

    const presentation = useTablePresentation({
      view,
      players: [null, { nickname: "Me" }, null, null],
      onDiscard: vi.fn(),
      dealer: 0,
    });
    if (!presentation) throw new Error("missing presentation");

    // Viewing seat is 1, so seat 0 (the dealer) sits at direction "left" — see seatLayout.
    expect(presentation.seats.left.isDealer).toBe(true);
    expect(presentation.seats.bottom.isDealer).toBe(false);
    expect(presentation.seats.top.isDealer).toBe(false);
    expect(presentation.seats.right.isDealer).toBe(false);
  });
});
