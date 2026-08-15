import { tileIdOf, type JunkAction, type JunkPlayerView, type TileKind } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { evaluateStructuralClaim, recommendStructuralClaim } from "./structural-claim.ts";

const ids = (kinds: readonly TileKind[]) => {
  const copies = new Map<TileKind, number>();
  return kinds.map((kind) => {
    const copy = copies.get(kind) ?? 0;
    copies.set(kind, copy + 1);
    return tileIdOf(kind, copy);
  });
};

const view = (hand: readonly TileKind[]): JunkPlayerView => ({
  seat: 0,
  hand: ids(hand),
  wallCount: 50,
  currentSeat: 0,
  dealer: 0,
  phase: "awaiting-claims",
  seats: [0, 1, 2, 3].map(() => ({
    handCount: 13,
    melds: [],
    discards: [],
    justDrawn: false,
  })),
});

describe("structural claim/pass policy", () => {
  it("passes when chi would break an already-tenpai hand", () => {
    const player = {
      ...view(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "9s", "9s", "9s", "1p"]),
      lastDiscard: { seat: 3 as const, tile: tileIdOf("4m", 1) },
    };
    const actions: JunkAction[] = [
      { type: "chi", tiles: [tileIdOf("3m", 0), tileIdOf("5m", 0)] },
      { type: "pass" },
    ];

    expect(recommendStructuralClaim(player, actions)).toBe(actions[1]);
  });

  it("pengs when the claim and best discard reach tenpai", () => {
    const player = {
      ...view(["2m", "3m", "4m", "5m", "6m", "7m", "8p", "8p", "3s", "3s", "6s", "7s", "1z"]),
      lastDiscard: { seat: 1 as const, tile: tileIdOf("3s", 2) },
    };
    const actions: JunkAction[] = [{ type: "peng" }, { type: "pass" }];
    const result = evaluateStructuralClaim(player, actions);

    expect(result.action).toBe(actions[0]);
    expect(result.candidates.find(({ action }) => action.type === "peng")?.shape).toMatchObject({
      standardShanten: 0,
    });
  });

  it("passes a chi that is structurally tied after its best discard", () => {
    const hand = ids(["4s", "5s", "6s", "7s", "8s", "9s", "1p", "2p", "3p", "4m"]);
    const player: JunkPlayerView = {
      ...view([]),
      hand,
      wallCount: 60,
      lastDiscard: { seat: 1, tile: tileIdOf("9s", 1) },
      seats: [
        {
          handCount: 10,
          melds: [{ type: "chi", tiles: ids(["1s", "2s", "3s"]), from: 3 }],
          discards: [],
          justDrawn: false,
        },
        ...view([]).seats.slice(1),
      ],
    };
    const actions: JunkAction[] = [{ type: "chi", tiles: [hand[3]!, hand[4]!] }, { type: "pass" }];
    const result = evaluateStructuralClaim(player, actions);
    const claim = result.candidates.find(({ action }) => action.type === "chi")!;
    const pass = result.candidates.find(({ action }) => action.type === "pass")!;

    expect(claim.shape).toEqual(pass.shape);
    expect(result.action).toBe(actions[1]);
  });

  it("searches replacement draws for minGang and chooses a strict structural improvement", () => {
    const player = {
      ...view(["2m", "3m", "4m", "5m", "6m", "7m", "8p", "8p", "3s", "3s", "3s", "6s", "7s"]),
      lastDiscard: { seat: 1 as const, tile: tileIdOf("3s", 3) },
    };
    const minGang: JunkAction = { type: "minGang" };
    const pass: JunkAction = { type: "pass" };
    const result = evaluateStructuralClaim(player, [minGang, pass]);
    const candidate = result.candidates.find(({ action }) => action.type === "minGang")!;

    expect(candidate).toMatchObject({ supported: true, drawKindCount: 33 });
    expect(candidate.leafCount).toBeGreaterThan(0);
    expect(candidate.immediateCompletionMass).toBeGreaterThan(0);
    expect(result.action).toBe(minGang);
  });

  it("passes when minGang has no replacement-draw branch and prioritizes hu", () => {
    const player = view(["1m", "1m", "1m"]);
    const pass: JunkAction = { type: "pass" };
    expect(recommendStructuralClaim(player, [{ type: "minGang" }, pass])).toBe(pass);
    const hu: JunkAction = { type: "hu" };
    expect(recommendStructuralClaim(player, [pass, hu])).toBe(hu);
  });
});
