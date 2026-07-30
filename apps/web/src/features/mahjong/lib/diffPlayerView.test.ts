import type { PlayerViewBase } from "@new-mj/protocol";
import { describe, expect, it } from "vitest";
import { diffPlayerView } from "./diffPlayerView";

const emptySeat = { handCount: 13, melds: [], discards: [], justDrawn: false };

const junkView = (patch: Partial<{ justDrawn: number; seats: unknown[] }> = {}): PlayerViewBase =>
  ({
    seat: 0,
    hand: [1, 2, 3],
    wallCount: 80,
    currentSeat: 0,
    seats: [emptySeat, emptySeat, emptySeat, emptySeat],
    ...patch,
  }) as unknown as PlayerViewBase;

describe("diffPlayerView", () => {
  it("produces nothing against a null prev (first connect / reconnect)", () => {
    expect(diffPlayerView(null, junkView(), 0)).toEqual([]);
  });

  it("emits a critical own-draw event when my private justDrawn changes", () => {
    const prev = junkView();
    const next = junkView({ justDrawn: 5 });
    expect(diffPlayerView(prev, next, 0)).toEqual([
      { key: "draw:own:0", category: "draw", critical: true },
    ]);
  });

  it("emits a non-critical opponent-draw event on seats[].justDrawn false->true", () => {
    const prev = junkView();
    const next = junkView({
      seats: [emptySeat, { ...emptySeat, justDrawn: true }, emptySeat, emptySeat],
    });
    expect(diffPlayerView(prev, next, 0)).toEqual([
      { key: "draw:opp:1", category: "draw", critical: false },
    ]);
  });

  it("emits one discard event per newly-appended discard entry, keyed by seat+index", () => {
    const prev = junkView({
      seats: [emptySeat, { ...emptySeat, discards: [{ tile: 1 }] }, emptySeat, emptySeat],
    });
    // Two discards landed between observations — both must be reported, not just the latest.
    const next = junkView({
      seats: [
        emptySeat,
        { ...emptySeat, discards: [{ tile: 1 }, { tile: 2 }, { tile: 3 }] },
        emptySeat,
        emptySeat,
      ],
    });
    expect(diffPlayerView(prev, next, 0)).toEqual([
      { key: "discard:1:1", category: "decorative", critical: false },
      { key: "discard:1:2", category: "decorative", critical: false },
    ]);
  });

  it("marks my own discards critical, an opponent's not", () => {
    const prev = junkView();
    const next = junkView({
      seats: [{ ...emptySeat, discards: [{ tile: 7 }] }, emptySeat, emptySeat, emptySeat],
    });
    expect(diffPlayerView(prev, next, 0)).toEqual([
      { key: "discard:0:0", category: "decorative", critical: true },
    ]);
  });

  it("emits a meld event for a new claimed meld, critical because it claimed my discard", () => {
    const prev = junkView();
    const next = junkView({
      seats: [
        emptySeat,
        { ...emptySeat, melds: [{ type: "peng", tiles: [1, 2, 3], from: 0 }] },
        emptySeat,
        emptySeat,
      ],
    });
    expect(diffPlayerView(prev, next, 0)).toEqual([
      { key: "meld:1:0:3", category: "decorative", critical: true },
    ]);
  });

  it("refines the meld key with the current tile count so an anGang extension isn't dropped", () => {
    const prev = junkView({
      seats: [
        { ...emptySeat, melds: [{ type: "anGang", tiles: [1, 1, 1] }] },
        emptySeat,
        emptySeat,
        emptySeat,
      ],
    });
    // Same meldIndex mutated in place (gang declared over an existing peng) — tile count grows 3->4.
    const next = junkView({
      seats: [
        { ...emptySeat, melds: [{ type: "anGang", tiles: [1, 1, 1, 1] }] },
        emptySeat,
        emptySeat,
        emptySeat,
      ],
    });
    expect(diffPlayerView(prev, next, 0)).toEqual([
      { key: "meld:0:0:4", category: "decorative", critical: true },
    ]);
  });

  it("produces no draw events for a ruleset with no justDrawn field at all (bloodbattle)", () => {
    const bloodbattleSeat = { handCount: 13, melds: [], discards: [], status: "playing" };
    const prev = {
      seat: 0,
      hand: [1, 2, 3],
      wallCount: 80,
      currentSeat: 0,
      seats: [bloodbattleSeat, bloodbattleSeat, bloodbattleSeat, bloodbattleSeat],
    } as unknown as PlayerViewBase;
    const next = {
      ...prev,
      currentSeat: 1,
      seats: [
        bloodbattleSeat,
        { ...bloodbattleSeat, discards: [{ tile: "5m" }] },
        bloodbattleSeat,
        bloodbattleSeat,
      ],
    } as unknown as PlayerViewBase;
    const events = diffPlayerView(prev, next, 0);
    expect(events.every((event) => event.category !== "draw")).toBe(true);
    expect(events).toEqual([{ key: "discard:1:0", category: "decorative", critical: false }]);
  });

  it("keys bloodbattle discards by seat+index, so two seats discarding the same TileKind never collide", () => {
    const bloodbattleSeat = { handCount: 13, melds: [], discards: [], status: "playing" };
    const prev = {
      seat: 0,
      hand: [1, 2, 3],
      wallCount: 80,
      currentSeat: 0,
      seats: [bloodbattleSeat, bloodbattleSeat, bloodbattleSeat, bloodbattleSeat],
    } as unknown as PlayerViewBase;
    const next = {
      ...prev,
      seats: [
        { ...bloodbattleSeat, discards: [{ tile: "5m" }] },
        { ...bloodbattleSeat, discards: [{ tile: "5m" }] },
        bloodbattleSeat,
        bloodbattleSeat,
      ],
    } as unknown as PlayerViewBase;
    const keys = diffPlayerView(prev, next, 0).map((event) => event.key);
    expect(keys).toEqual(["discard:0:0", "discard:1:0"]);
    expect(new Set(keys).size).toBe(2);
  });
});
