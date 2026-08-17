import { tileIdOf, type JunkAction, type JunkPlayerView, type TileKind } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { evaluateStructuralTurn, recommendStructuralTurn } from "./structural-turn.ts";

const ids = (kinds: readonly TileKind[]) => {
  const copies = new Map<TileKind, number>();
  return kinds.map((kind) => {
    const copy = copies.get(kind) ?? 0;
    copies.set(kind, copy + 1);
    return tileIdOf(kind, copy);
  });
};

const view = (
  hand: readonly number[],
  melds: JunkPlayerView["seats"][number]["melds"] = [],
): JunkPlayerView => ({
  seat: 0,
  hand: [...hand],
  wallCount: 50,
  currentSeat: 0,
  dealer: 0,
  phase: "playing",
  seats: [0, 1, 2, 3].map((seat) => ({
    handCount: seat === 0 ? hand.length : 13,
    melds: seat === 0 ? melds : [],
    discards: [],
    justDrawn: seat === 0,
  })),
});

const discards = (hand: readonly number[]): JunkAction[] =>
  hand.map((tile) => ({ type: "discard", tile }));

describe("structural self-turn policy", () => {
  it("models anGang but falls back to its structurally equivalent discard", () => {
    const hand = ids([
      "3s",
      "3s",
      "3s",
      "3s",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "7m",
      "8p",
      "8p",
      "6s",
      "7s",
    ]);
    const gang: JunkAction = { type: "anGang", kind: "3s" };
    const result = evaluateStructuralTurn(view(hand), [gang, ...discards(hand)]);
    const candidate = result.candidates.find(({ action }) => action.type === "anGang")!;

    expect(candidate).toMatchObject({ supported: true, drawKindCount: 33 });
    expect(result.action?.type).toBe("discard");
  });

  it("models buGang but falls back to discarding the fourth tile", () => {
    const peng = ids(["9s", "9s", "9s"]);
    const fourth = tileIdOf("9s", 3);
    const hand = [fourth, ...ids(["2m", "3m", "4m", "5m", "6m", "7m", "8p", "8p", "6s", "7s"])];
    const gang: JunkAction = { type: "buGang", tile: fourth };
    const result = evaluateStructuralTurn(view(hand, [{ type: "peng", tiles: peng, from: 1 }]), [
      gang,
      ...discards(hand),
    ]);
    const candidate = result.candidates.find(({ action }) => action.type === "buGang")!;

    expect(candidate).toMatchObject({ supported: true, drawKindCount: 33 });
    expect(result.action).toEqual({ type: "discard", tile: fourth });
  });

  it("prioritizes zimo", () => {
    const hand = ids(["1m"]);
    const zimo: JunkAction = { type: "zimo" };
    expect(recommendStructuralTurn(view(hand), [...discards(hand), zimo])).toBe(zimo);
  });
});
