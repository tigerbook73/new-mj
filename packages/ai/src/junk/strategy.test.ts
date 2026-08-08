import {
  createPrng,
  isTingpai,
  nextUint32,
  tileIdOf,
  type JunkAction,
  type JunkPlayerView,
  type TileKind,
} from "@new-mj/core";
import { describe, expect, it, vi } from "vitest";
import {
  chooseJunkAction,
  DEFAULT_JUNK_WEIGHTS,
  recommendJunkAction,
  scoreHandShapeAfterDiscard,
} from "./strategy.ts";

/** Deterministic [0, 1) generator over @new-mj/core's xorshift32 PRNG — same
 * reproducibility primitive core's own fuzz driver uses, so a fixed seed always
 * replays the exact same sample sequence. */
const seededRandom = (seed: number): (() => number) => {
  let prng = createPrng(seed);
  return () => {
    const step = nextUint32(prng);
    prng = step.prng;
    return step.value / 0x1_0000_0000;
  };
};

const ids = (kinds: readonly TileKind[]) => {
  const copies = new Map<TileKind, number>();
  return kinds.map((kind) => {
    const copy = copies.get(kind) ?? 0;
    copies.set(kind, copy + 1);
    return tileIdOf(kind, copy);
  });
};

const view = (hand: TileKind[]): JunkPlayerView => ({
  seat: 0,
  hand: ids(hand),
  wallCount: 50,
  currentSeat: 0,
  dealer: 0,
  phase: "playing",
  seats: [0, 1, 2, 3].map(() => ({ handCount: 13, melds: [], discards: [], justDrawn: false })),
});
describe("junk strategy", () => {
  it("always takes a legal win and preserves its original reference", () => {
    const actions: JunkAction[] = [{ type: "pass" }, { type: "hu" }];
    expect(recommendJunkAction(view(["1m"]), actions)).toBe(actions[1]);
  });

  it("keeps a one-away hand instead of breaking it", () => {
    const player = view([
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "7m",
      "8m",
      "9m",
      "1p",
      "1p",
      "1s",
      "1s",
      "1s",
    ]);
    const actions: JunkAction[] = player.hand.map((tile) => ({ type: "discard", tile }));
    const result = chooseJunkAction(player, actions);
    expect(result.type).toBe("discard");
    if (result.type !== "discard") throw new Error("expected discard");
    expect(actions).toContain(result);
    expect(
      isTingpai(
        player.hand.filter((tile) => tile !== result.tile),
        { sevenPairs: true },
      ),
    ).toBe(true);
  });

  it("passes on a chi that would break an already-tenpai hand", () => {
    // Bug report: the AI never recommended pass, and would chi even when the
    // player already held a complete concealed triplet — because pass was
    // scored as a hardcoded -1000 regardless of how good the current hand
    // already was. Here the hand is tenpai (a complete 1m-9m run, a concealed
    // 9s triplet, waiting to pair 1p) and the only chi available would tear
    // the run apart for no gain — pass must win.
    const player: JunkPlayerView = {
      ...view(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "9s", "9s", "9s", "1p"]),
      lastDiscard: { seat: 3, tile: tileIdOf("4m", 1) },
    };
    const actions: JunkAction[] = [
      { type: "chi", tiles: [tileIdOf("3m", 0), tileIdOf("5m", 0)] },
      { type: "pass" },
    ];
    expect(recommendJunkAction(player, actions)).toBe(actions[1]);
  });

  it("uses visible discards as a safety tie-break", () => {
    const player = view(["1m", "1m", "2m", "2m"]);
    const first = player.hand[0]!;
    const second = player.hand[2]!;
    expect(
      scoreHandShapeAfterDiscard({ hand: player.hand, melds: [] }, first, [first]),
    ).toBeGreaterThan(scoreHandShapeAfterDiscard({ hand: player.hand, melds: [] }, second));
  });

  it("always evaluates seven-pairs potential under Junk's fixed rules", () => {
    // 6 对 + 7z + 9m：打掉孤张 9m 后按七对听 7z（向听 0）；拆一对 1z 则退回
    // 向听 1。两者分差主要来自向听 ×100——若七对不再参与向听评估，两个弃牌
    // 的标准型向听相同，分差会塌缩到个位数，本断言即失败。
    const player = view([
      "1z",
      "1z",
      "2z",
      "2z",
      "3z",
      "3z",
      "4z",
      "4z",
      "5z",
      "5z",
      "6z",
      "6z",
      "7z",
      "9m",
    ]);
    const keepPairs = scoreHandShapeAfterDiscard(
      { hand: player.hand, melds: [] },
      player.hand[13]!,
    );
    const breakPair = scoreHandShapeAfterDiscard({ hand: player.hand, melds: [] }, player.hand[0]!);
    expect(keepPairs - breakPair).toBeGreaterThan(50);
  });

  it("prefers anGang over buGang when both leave an equally good hand", () => {
    // Realistic mid-hand state: seat 0 already has a peng of 9s and holds the
    // 4th copy (buGang-eligible) plus a concealed 1m kong (anGang-eligible) and
    // two clean runs — both gangs leave a comparable shape, so only the fixed
    // gangkai bonus (anGang 5 > buGang 3) should decide the recommendation.
    const pengTiles = [0, 1, 2].map((copy) => tileIdOf("9s", copy));
    const hand = [
      ...[0, 1, 2, 3].map((copy) => tileIdOf("1m", copy)),
      tileIdOf("9s", 3),
      ...ids(["1p", "2p", "3p", "4p", "5p", "6p"]),
    ];
    const player: JunkPlayerView = {
      seat: 0,
      hand,
      wallCount: 50,
      currentSeat: 0,
      dealer: 0,
      phase: "playing",
      seats: [0, 1, 2, 3].map((seat) => ({
        handCount: seat === 0 ? hand.length : 13,
        melds: seat === 0 ? [{ type: "peng", tiles: pengTiles, from: 1 }] : [],
        discards: [],
        justDrawn: false,
      })),
    };
    const actions: JunkAction[] = [
      { type: "anGang", kind: "1m" },
      { type: "buGang", tile: tileIdOf("9s", 3) },
    ];
    expect(recommendJunkAction(player, actions)).toBe(actions[0]);
  });

  it("prefers discarding an isolated honor over an isolated number tile at equal shanten (plan.md AI Bot blind spot)", () => {
    // 3 complete runs + a pair + two "junk" singles (1z, 9s) that neither
    // connects to anything nor changes shanten however they're discarded —
    // pre-fix, handQuality scored both discards identically (shanten tied at
    // 1, fanPotential tied, improvements gated off since 1-shanten already
    // triggers it but both waits are symmetric), so argmax picked whichever
    // came first in legalActions. Listing the honor discard *last* reproduces
    // that failure mode directly.
    const player = view([
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "1p",
      "2p",
      "3p",
      "1s",
      "1s",
      "1z",
      "9s",
    ]);
    const discardNumber: JunkAction = { type: "discard", tile: player.hand[12]! };
    const discardHonor: JunkAction = { type: "discard", tile: player.hand[11]! };
    expect(recommendJunkAction(player, [discardNumber, discardHonor])).toBe(discardHonor);
  });

  it("does not reward breaking a genuinely redundant tatsu to manufacture a new isolated tile", () => {
    // 2 complete runs + 3 *symmetric* ryanmen tatsu (5p6p, 3s4s, 7s8s) + 2 lone
    // honors. standardShanten's usableTatsu is capped at (4 - melds) = 2 here,
    // so only 2 of the 3 tatsu ever count — any one of them, including 5p6p,
    // is exactly as redundant as either honor: discarding half of it changes
    // shanten no more than discarding a honor does. Regression found in real
    // play: pre-fix, isolationPotential scored the *post-discard* hand, so
    // breaking 5p6p left a "newly isolated" 5p that collected the isolation
    // bonus — making the AI prefer discarding 6p (breaking a useful shape)
    // over discarding a genuinely useless lone honor.
    const player = view([
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "5p",
      "6p",
      "3s",
      "4s",
      "7s",
      "8s",
      "1z",
      "2z",
    ]);
    const discardTatsuTile: JunkAction = { type: "discard", tile: player.hand[7]! }; // 6p
    const discardHonor: JunkAction = { type: "discard", tile: player.hand[12]! }; // 1z
    expect(
      scoreHandShapeAfterDiscard({ hand: player.hand, melds: [] }, discardTatsuTile.tile),
    ).toBe(scoreHandShapeAfterDiscard({ hand: player.hand, melds: [] }, discardHonor.tile));
    // With scores genuinely tied, listing the tatsu-breaking discard first
    // pins down that it no longer wins outright (which is what the bug did).
    expect(recommendJunkAction(player, [discardTatsuTile, discardHonor])).toBe(discardTatsuTile);
  });

  it("prefers keeping a live wait over a dead one (theoretical -> practical ukeire)", () => {
    // Same shape as above, but both junk singles are numbered (9s, 9p) — tied
    // on isolationPotential too — so only the live-copy count can break the
    // tie. Seat 1 has already discarded all three other copies of 9s: keeping
    // 9s after this discard would wait on a fully dead kind.
    const hand = ids([
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "1p",
      "2p",
      "3p",
      "1s",
      "1s",
      "9s",
      "9p",
    ]);
    const player: JunkPlayerView = {
      seat: 0,
      hand,
      wallCount: 50,
      currentSeat: 0,
      dealer: 0,
      phase: "playing",
      seats: [0, 1, 2, 3].map((seat) => ({
        handCount: seat === 0 ? hand.length : 13,
        melds: [],
        discards: seat === 1 ? [1, 2, 3].map((copy) => ({ tile: tileIdOf("9s", copy) })) : [],
        justDrawn: false,
      })),
    };
    const keepLive9p: JunkAction = { type: "discard", tile: hand[11]! }; // discards 9s
    const keepDead9s: JunkAction = { type: "discard", tile: hand[12]! }; // discards 9p
    expect(recommendJunkAction(player, [keepDead9s, keepLive9p])).toBe(keepLive9p);
  });

  it("throws only when there is no legal action", () => {
    expect(() => chooseJunkAction(view([]), [])).toThrow("no legal actions");
  });

  describe("strength config", () => {
    // Discarding either copy of a symmetric two-pair hand (1m1m2m2m) scores
    // identically with no melds — proven by the "safety tie-break" test above,
    // which only differs once a visible-discard bonus is added. That symmetry
    // (and the tininess of the resulting 3-tile hand, which keeps shanten well
    // above the ukeire<=1 threshold so `improvements` never breaks the tie) makes
    // it a clean pair of tied-score actions for softmax sampling tests.
    const tiedHand = ids(["1m", "1m", "2m", "2m"]);
    const tiedView = view(["1m", "1m", "2m", "2m"]);
    const discardA: JunkAction = { type: "discard", tile: tiedHand[0]! };
    const discardB: JunkAction = { type: "discard", tile: tiedHand[2]! };
    const tiedActions: JunkAction[] = [discardA, discardB];

    // Same hand, but seat 1 has already discarded the tile in `discardA` — the
    // +4 safety bonus (see scoreHandShapeAfterDiscard) gives discardA a small
    // but clear, deterministic edge over discardB.
    const gapView: JunkPlayerView = {
      ...tiedView,
      seats: [0, 1, 2, 3].map((seat) => ({
        handCount: seat === 0 ? tiedHand.length : 13,
        melds: [],
        discards: seat === 1 ? [{ tile: tiedHand[0]! }] : [],
        justDrawn: false,
      })),
    };
    const gapActions: JunkAction[] = [discardA, discardB];

    it("temperature 0 matches the omitted-parameter default", () => {
      expect(recommendJunkAction(tiedView, tiedActions, { temperature: 0 })).toBe(
        recommendJunkAction(tiedView, tiedActions),
      );
    });

    it("temperature 0 ignores an injected random source", () => {
      const hostileRandom = () => 0.999;
      expect(
        recommendJunkAction(gapView, gapActions, { temperature: 0, random: hostileRandom }),
      ).toBe(recommendJunkAction(gapView, gapActions));
    });

    it("a legal win bypasses temperature/random entirely", () => {
      const random = vi.fn(() => 0.5);
      const actions: JunkAction[] = [{ type: "pass" }, { type: "hu" }];
      expect(recommendJunkAction(view(["1m"]), actions, { temperature: 1000, random })).toBe(
        actions[1],
      );
      expect(random).not.toHaveBeenCalled();
    });

    it("returns the only legal action regardless of temperature/random", () => {
      const random = () => 0.5;
      expect(recommendJunkAction(tiedView, [discardA], { temperature: 5, random })).toBe(discardA);
    });

    it("low temperature converges to the higher-scoring action", () => {
      const random = seededRandom(1);
      const results = Array.from({ length: 200 }, () =>
        recommendJunkAction(gapView, gapActions, { temperature: 0.5, random }),
      );
      expect(results.every((result) => result === discardA)).toBe(true);
    });

    it("moderate temperature produces a mixed outcome for near-tied scores", () => {
      const random = seededRandom(1);
      const results = Array.from({ length: 200 }, () =>
        recommendJunkAction(gapView, gapActions, { temperature: 100, random }),
      );
      const countA = results.filter((result) => result === discardA).length;
      expect(countA).toBeGreaterThan(40);
      expect(countA).toBeLessThan(160);
    });

    it("a fixed seed reproduces the exact same sampled action", () => {
      const random = seededRandom(42);
      const result = recommendJunkAction(tiedView, tiedActions, { temperature: 1, random });
      // Pinned from an actual run — this is a reproducibility lock, not a hand-derived value.
      expect(result).toBe(discardA);
    });

    it("chooseJunkAction forwards the strength config", () => {
      const random = seededRandom(7);
      const strength = { temperature: 0.5, random };
      expect(chooseJunkAction(gapView, gapActions, strength)).toBe(
        recommendJunkAction(gapView, gapActions, { temperature: 0.5, random: seededRandom(7) }),
      );
    });
  });

  describe("weight overrides", () => {
    it("recommendJunkAction with DEFAULT_JUNK_WEIGHTS matches the omitted-weights default", () => {
      const player = view(["1m", "1m", "2m", "2m"]);
      const actions: JunkAction[] = [
        { type: "discard", tile: player.hand[0]! },
        { type: "discard", tile: player.hand[2]! },
      ];
      expect(recommendJunkAction(player, actions, {}, DEFAULT_JUNK_WEIGHTS)).toBe(
        recommendJunkAction(player, actions),
      );
    });

    it("scoreHandShapeAfterDiscard honors a custom safetyBonus weight", () => {
      const hand = ids(["1m", "1m", "2m", "2m"]);
      const discard = hand[0]!;
      const customWeights = { ...DEFAULT_JUNK_WEIGHTS, safetyBonus: 999 };
      const defaultScore = scoreHandShapeAfterDiscard({ hand, melds: [] }, discard, [discard]);
      const customScore = scoreHandShapeAfterDiscard(
        { hand, melds: [] },
        discard,
        [discard],
        customWeights,
      );
      // Only the safety term differs between these two calls (same hand/discard/
      // visibleDiscards) — the delta must equal exactly the weight difference.
      expect(customScore - defaultScore).toBeCloseTo(999 - DEFAULT_JUNK_WEIGHTS.safetyBonus, 6);
    });

    it("scoreHandShapeAfterDiscard honors a custom pengpenghu weight (regression: weight was defined but never read)", () => {
      // Bug: pengpenghu was declared in JunkWeights and default-weights.json but
      // fanPotential never added it to the score — this test fails on the
      // pre-fix code (delta would be 0, not the weight difference).
      const hand = ids(["1m", "1m", "2m", "2m"]);
      const discard = hand[0]!;
      const customWeights = {
        ...DEFAULT_JUNK_WEIGHTS,
        pengpenghu: DEFAULT_JUNK_WEIGHTS.pengpenghu + 999,
      };
      const defaultScore = scoreHandShapeAfterDiscard({ hand, melds: [] }, discard);
      const customScore = scoreHandShapeAfterDiscard(
        { hand, melds: [] },
        discard,
        [],
        customWeights,
      );
      expect(customScore - defaultScore).toBeCloseTo(999, 6);
    });

    it("scoreHandShapeAfterDiscard honors a custom shantenWeight", () => {
      // A messy, far-from-complete hand always has shanten > 0 after any discard,
      // so doubling the (negative) shanten penalty must make the score strictly
      // worse — this holds regardless of the hand's exact shanten value.
      const hand = ids(["1m", "5p", "9s", "2z"]);
      const discard = hand[0]!;
      const doubledShanten = {
        ...DEFAULT_JUNK_WEIGHTS,
        shantenWeight: DEFAULT_JUNK_WEIGHTS.shantenWeight * 2,
      };
      const defaultScore = scoreHandShapeAfterDiscard({ hand, melds: [] }, discard);
      const doubledScore = scoreHandShapeAfterDiscard(
        { hand, melds: [] },
        discard,
        [],
        doubledShanten,
      );
      expect(doubledScore).toBeLessThan(defaultScore);
    });
  });
});
