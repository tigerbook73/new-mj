import {
  createPrng,
  isTingpai,
  nextUint32,
  tileIdOf,
  type JunkAction,
  type JunkPlayerView,
  type TileId,
  type TileKind,
} from "@new-mj/core";
import { describe, expect, it, vi } from "vitest";
import {
  chooseJunkAction,
  DEFAULT_JUNK_WEIGHTS,
  probeSelfDrawTwoPly,
  recommendJunkAction,
  scoreHandShapeAfterDiscard,
  type GameProgress,
  type JunkWeights,
} from "./strategy.ts";
import { probabilityAtLeastOneDraw } from "./tile-probability.ts";

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
  it("two-ply probe recognizes a live bridge through its post-draw leaf, without giving close ranks a flat bonus", () => {
    // Three complete runs plus a pair leave one block to build. Both candidates
    // have the same surrounding hand; the target keeps 3m6m, while the control
    // keeps the more spread-out 2m7m. The target's 4m draw makes 3m4m6m, whose
    // best follow-up discard has genuinely better shape than the control's 4m
    // draw. This intentionally does *not* assert that the target's total EV is
    // larger: the control has a wider first-step catchment, exactly the point
    // that a conditional leaf score must remain separate from raw breadth.
    const shared: TileKind[] = ["1p", "2p", "3p", "4p", "5p", "6p", "7s", "8s", "9s", "1z", "1z"];
    const progress: GameProgress = { wallCount: 84, unseenPoolSize: 123 };
    const bridge = probeSelfDrawTwoPly(
      { hand: ids([...shared, "3m", "6m"]), melds: [] },
      [],
      DEFAULT_JUNK_WEIGHTS,
      progress,
    );
    const control = probeSelfDrawTwoPly(
      { hand: ids([...shared, "2m", "7m"]), melds: [] },
      [],
      DEFAULT_JUNK_WEIGHTS,
      progress,
    );
    const bridge4m = bridge.outcomes.find(({ kind }) => kind === "4m");
    const control4m = control.outcomes.find(({ kind }) => kind === "4m");
    expect(bridge.continuationProbability).toBeCloseTo(1, 12);
    expect(bridge4m?.leafScore).toBeGreaterThan(control4m?.leafScore ?? Number.POSITIVE_INFINITY);
  });

  it("two-ply probe does not reward a bridge whose every copy is already visible", () => {
    const hand = ids([
      "1p",
      "2p",
      "3p",
      "4p",
      "5p",
      "6p",
      "7s",
      "8s",
      "9s",
      "1z",
      "1z",
      "3m",
      "6m",
    ]);
    // All four copies of both bridge ranks have left the unseen pool. The
    // corresponding wall/unseen counts remain physically consistent with 13
    // own tiles, 39 opponent concealed tiles, and 8 visible discards.
    const deadBridgeTiles = ids(["4m", "4m", "4m", "4m", "5m", "5m", "5m", "5m"]);
    const result = probeSelfDrawTwoPly({ hand, melds: [] }, deadBridgeTiles, DEFAULT_JUNK_WEIGHTS, {
      wallCount: 76,
      unseenPoolSize: 115,
    });
    expect(result.outcomes.some(({ kind }) => kind === "4m" || kind === "5m")).toBe(false);
    expect(result.continuationProbability).toBeCloseTo(1, 12);
  });

  it("two-ply probe reports an immediate self-draw win separately from continuation leaves", () => {
    const hand = ids([
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
      "2s",
    ]);
    const result = probeSelfDrawTwoPly({ hand, melds: [] }, [], DEFAULT_JUNK_WEIGHTS, {
      wallCount: 84,
      unseenPoolSize: 123,
    });
    const win = result.outcomes.find(({ kind }) => kind === "3s");
    expect(win).toEqual({ kind: "3s", probability: 4 / 123 });
    expect(result.winProbability).toBeCloseTo(4 / 123, 12);
  });

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

  it("still pengs when doing so reaches tenpai (regression guard: tenpaiProbabilityWeight's endgame-awareness must not make claiming too conservative)", () => {
    // Phase 1 (improvementWeight -> tenpaiProbabilityWeight, plan.md 2026-08-08)
    // made the AI decline plenty of marginal chi/peng opportunities it used to
    // take, because the probability term saturates while menqing's fixed cost
    // doesn't — an accepted, direction-sound side effect (see plan.md), but one
    // that needs a lower bound: a claim that's *substantially* good (not
    // marginal) must still win. Here two complete runs (2m3m4m, 5m6m7m) + a
    // pair (8p8p) + a pengable pair (3s3s) + a ryanmen (6s7s) + one dead honor
    // (1z) is 1-shanten; pengging the discarded 3s and discarding the useless
    // 1z reaches tenpai (shanten 0) — a full shanten-level jump that must
    // dominate menqing's loss regardless of how conservative the probability
    // term has become.
    const player: JunkPlayerView = {
      ...view(["2m", "3m", "4m", "5m", "6m", "7m", "8p", "8p", "3s", "3s", "6s", "7s", "1z"]),
      lastDiscard: { seat: 1, tile: tileIdOf("3s", 2) },
    };
    const actions: JunkAction[] = [{ type: "peng" }, { type: "pass" }];
    expect(recommendJunkAction(player, actions)).toBe(actions[0]);
  });

  it("declines a chi that only trades one tanki wait for an equally-wide one (chiHurdle regression)", () => {
    // 1 declared meld (1s2s3s) + concealed 4s5s6s + 7s8s9s + 1p2p3p (three
    // complete runs) + a lone 4m: already tenpai, waiting tanki on 4m (4 melds
    // + isolated single). Seat 1 discards a second 9s; chi-ing it with hand's
    // 7s+8s forms a *new* declared run, leaving hand's own 9s as the new
    // isolated tile — a straight swap of one tanki wait for another, same
    // width, no shanten change. Since both branches share the exact same
    // shanten/fanPotential/isolationPotential and (here) the same live-tile
    // count for their respective tanki target, the *raw* pre-hurdle scores are
    // exactly equal (verified to 10 decimal places) — a genuine tie, not just
    // a thin margin. Declining a tied claim is exactly what a hurdle is for:
    // opening the hand should require a *real* edge, not a coin flip. Without
    // chiHurdle, argmaxAction's first-wins tie-break would still pick the
    // claim purely because it's listed first in `actions` — an arbitrary
    // reason to give up menqing, which chiHurdle correctly overrides.
    const hand = ids(["4s", "5s", "6s", "7s", "8s", "9s", "1p", "2p", "3p", "4m"]);
    const player: JunkPlayerView = {
      seat: 0,
      hand,
      wallCount: 60,
      currentSeat: 0,
      dealer: 0,
      phase: "playing",
      lastDiscard: { seat: 1, tile: tileIdOf("9s", 1) },
      seats: [
        {
          handCount: 10,
          melds: [{ type: "chi", tiles: ids(["1s", "2s", "3s"]), from: 3 }],
          discards: [],
          justDrawn: false,
        },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
      ],
    };
    const chi: JunkAction = { type: "chi", tiles: [hand[3]!, hand[4]!] }; // 7s, 8s
    const actions: JunkAction[] = [chi, { type: "pass" }];
    expect(recommendJunkAction(player, actions)).toBe(actions[1]);
    const noHurdle: JunkWeights = { ...DEFAULT_JUNK_WEIGHTS, chiHurdle: 0 };
    expect(recommendJunkAction(player, actions, {}, noHurdle)).toBe(actions[0]);
  });

  it("declines a thin-margin peng that only trades a wide wait for a narrower one (pengHurdle regression, mined from self-play seed=5 step=75)", () => {
    // Real position from arena self-play, reconstructed from the exact raw
    // TileIds the arena produced (not re-derived by kind — this hand has
    // several tombstoned claimed-discard entries shared with declared melds,
    // e.g. seat 3's tile 81 is both a discard-pile tombstone and one of this
    // seat's own chi-meld tiles; re-deriving fresh TileIds per kind broke that
    // sharing and silently drifted the score by colliding two *different*
    // physical tiles onto the same id instead — see plan.md/session notes on
    // this fixture's construction for the debugging story). Decoded: this
    // seat holds 1m2m6m8m3s3s6s concealed with a declared 1z1z1z peng and
    // 1s2s3s chi; seat 3 discards a second 3s, peng-able against the existing
    // pair. Pre-fix (buggy ukeire ignoring exposed melds) this claim looked
    // meaningfully positive; post-fix the raw margin is only +2.6 — comfortably
    // under pengHurdle's default (4), so the hurdle correctly falls back to
    // pass; zeroing it recovers the pre-hurdle pick.
    const player: JunkPlayerView = {
      seat: 0,
      hand: [2, 6, 20, 28, 80, 82, 93],
      dealer: 1,
      seats: [
        {
          melds: [
            { type: "peng", tiles: [108, 111, 110], from: 2 },
            { type: "chi", tiles: [73, 76, 81], from: 3 },
          ],
          discards: [
            { tile: 123 },
            { tile: 114, claimedBy: 2 },
            { tile: 21, claimedBy: 1 },
            { tile: 33 },
            { tile: 127 },
            { tile: 54, claimedBy: 2 },
            { tile: 130 },
            { tile: 37 },
            { tile: 95, claimedBy: 1 },
          ],
          handCount: 7,
          justDrawn: false,
        },
        {
          melds: [
            { type: "chi", tiles: [16, 25, 21], from: 0 },
            { type: "chi", tiles: [89, 98, 95], from: 0 },
          ],
          discards: [
            { tile: 120 },
            { tile: 128 },
            { tile: 116 },
            { tile: 78 },
            { tile: 47 },
            { tile: 1 },
            { tile: 97 },
            { tile: 12, claimedBy: 2 },
          ],
          handCount: 7,
          justDrawn: false,
        },
        {
          melds: [
            { type: "peng", tiles: [115, 113, 114], from: 0 },
            { type: "peng", tiles: [53, 55, 54], from: 0 },
            { type: "peng", tiles: [14, 13, 12], from: 1 },
          ],
          discards: [
            { tile: 110, claimedBy: 0 },
            { tile: 102 },
            { tile: 68 },
            { tile: 105 },
            { tile: 103 },
            { tile: 65 },
            { tile: 45 },
            { tile: 48 },
            { tile: 63 },
            { tile: 18 },
          ],
          handCount: 4,
          justDrawn: false,
        },
        {
          melds: [],
          discards: [
            { tile: 122 },
            { tile: 112 },
            { tile: 135 },
            { tile: 77 },
            { tile: 81, claimedBy: 0 },
            { tile: 46 },
            { tile: 66 },
            { tile: 61 },
            { tile: 83 },
          ],
          handCount: 13,
          justDrawn: false,
        },
      ],
      wallCount: 55,
      currentSeat: 3,
      phase: "awaiting-claims",
      lastDiscard: { seat: 3, tile: 83 },
    };
    const actions: JunkAction[] = [{ type: "peng" }, { type: "pass" }];
    expect(recommendJunkAction(player, actions)).toBe(actions[1]);
    const noHurdle: JunkWeights = { ...DEFAULT_JUNK_WEIGHTS, pengHurdle: 0 };
    expect(recommendJunkAction(player, actions, {}, noHurdle)).toBe(actions[0]);
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

  it("prefers discarding a lone honor over breaking a live number-tile cluster, even far from tenpai (regression guard: ukeire's ungated mid-game signal, plan.md 2026-08-08)", () => {
    // Turn 2 of a real self-played game (round 0, step 2, wallCount=82) — many
    // shanten away from tenpai. `handQuality` used to only compute ukeire when
    // shanten<=1 ("2 层穷举" was considered too expensive to run every turn);
    // now that shanten/ukeire are microsecond-fast, the gate was removed so
    // this signal reaches the mid-game too. Before removing it, discarding 7s
    // (which sits between live neighbors 6s/8s) and discarding 5z (a lone
    // honor connected to nothing) tied on every other term this far from
    // tenpai, so argmax picked whichever came first in hand order — an
    // arbitrary tie, not a real judgment. With ukeire ungated, keeping the
    // 6s/8s-connected tile and discarding the honor is now a deliberate,
    // reasoned pick.
    const player = view([
      "1m",
      "2s",
      "2s",
      "2z",
      "3s",
      "4z",
      "5z",
      "6p",
      "6s",
      "7s",
      "7z",
      "7z",
      "8s",
      "9p",
    ]);
    const discardSequenceTile: JunkAction = { type: "discard", tile: player.hand[9]! }; // 7s
    const discardHonor: JunkAction = { type: "discard", tile: player.hand[6]! }; // 5z
    expect(recommendJunkAction(player, [discardSequenceTile, discardHonor])).toBe(discardHonor);
  });

  it("does not reward breaking a genuinely redundant tatsu to manufacture a new isolated tile", () => {
    // 2 complete runs + 3 *symmetric* ryanmen tatsu (5p6p, 3s4s, 7s8s) + 2 lone
    // honors. standardShanten's usableTatsu is capped at (4 - melds) = 2 here,
    // so only 2 of the 3 tatsu ever count on shanten alone — any one of them,
    // including 5p6p, is exactly as redundant as either honor there.
    // Historical regression: pre-fix, isolationPotential scored the
    // *post-discard* hand, so breaking 5p6p left a "newly isolated" 5p that
    // collected the isolation bonus — making the AI prefer discarding 6p
    // (breaking a useful shape) over discarding a genuinely useless lone
    // honor. Originally this hand's two candidates scored *exactly* tied
    // (shanten=2, so ukeire was gated off before plan.md's 2026-08-08
    // mid-game ukeire change) and the test could only probe list-order
    // behavior; now ukeire is ungated and genuinely tells them apart (keeping
    // the tatsu scores higher), so this asserts the correct discard wins
    // outright, independent of list order.
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
    expect(recommendJunkAction(player, [discardTatsuTile, discardHonor])).toBe(discardHonor);
    expect(recommendJunkAction(player, [discardHonor, discardTatsuTile])).toBe(discardHonor);
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

  it("values the same live wait less as the wall runs low (tenpaiProbabilityWeight reads GameProgress, not just the raw live-tile count)", () => {
    // Same hand/discard as the previous test (keeping the 3-live-copy 9p wait);
    // only wallCount changes. A flat per-live-copy weight (the pre-Phase-1
    // formula) would score this identically regardless of how many draws are
    // left — this is the behavior that was structurally impossible before
    // GameProgress existed, so it's the one fact this test needs to pin down.
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
    const shapeInput = { hand, melds: [] };
    const discard = hand[11]!; // discards 9s, keeps the live 9p wait
    const othersHandCount = 39; // 3 opponents x 13, matching this file's `view` helper convention
    const earlyGame: GameProgress = {
      wallCount: 60,
      unseenPoolSize: 60 + othersHandCount,
    };
    const lateGame: GameProgress = {
      wallCount: 4,
      unseenPoolSize: 4 + othersHandCount,
    };
    const earlyScore = scoreHandShapeAfterDiscard(
      shapeInput,
      discard,
      [],
      DEFAULT_JUNK_WEIGHTS,
      undefined,
      earlyGame,
    );
    const lateScore = scoreHandShapeAfterDiscard(
      shapeInput,
      discard,
      [],
      DEFAULT_JUNK_WEIGHTS,
      undefined,
      lateGame,
    );
    expect(earlyScore).toBeGreaterThan(lateScore);
  });

  it("estimates self-draw probability from the wall alone, not a merged wall+opponents pool (plan.md ③: tenpaiProbability's zimo channel)", () => {
    // A clean single-kind tenpai wait (123456789m run of 3 + 11p pair + 12s
    // kanchan, waiting only on 3s) padded with a dead 14th tile (1z) so
    // scoreHandShapeAfterDiscard has something to discard; after discarding 1z
    // the hand is back to the same tenpai shape, so `improvements` is the live
    // copy count of 3s alone (4, none seen yet) — one unambiguous number to
    // hand-verify against, unlike a multi-kind ukeire wait.
    const hand = ids([
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
      "2s",
      "1z",
    ]);
    const shapeInput = { hand, melds: [] };
    const discard = hand[13]!; // discards 1z
    const liveCopies = 4;

    const wallCount = 8;
    const othersHandCount = 39;
    const remainingDraws = Math.ceil(wallCount / 4);

    // Baseline where wallCount === unseenPoolSize (no opponents to distinguish):
    // the merged-pool (pre-fix) and wall-only (fixed) formulas coincide here, so
    // this isolates the score's non-probability terms (shanten/fanPotential/
    // isolationPotential/safety), none of which read GameProgress.
    const noOthersProgress: GameProgress = { wallCount, unseenPoolSize: wallCount };
    const baselineScore = scoreHandShapeAfterDiscard(
      shapeInput,
      discard,
      [],
      DEFAULT_JUNK_WEIGHTS,
      undefined,
      noOthersProgress,
    );
    const nonProbabilityTerms =
      baselineScore -
      DEFAULT_JUNK_WEIGHTS.tenpaiProbabilityWeight *
        probabilityAtLeastOneDraw(wallCount, liveCopies, remainingDraws);

    const realisticProgress: GameProgress = {
      wallCount,
      unseenPoolSize: wallCount + othersHandCount,
    };
    const actualScore = scoreHandShapeAfterDiscard(
      shapeInput,
      discard,
      [],
      DEFAULT_JUNK_WEIGHTS,
      undefined,
      realisticProgress,
    );

    // Fixed formula: a self-draw only ever pulls from the wall, so the draw
    // simulation samples `wallCount` tiles, not the wall+opponents pool — but
    // successCount must shrink to this seat's expected *wall share* of the live
    // copies (exchangeability, see GameProgress's doc comment), since
    // liveUkeireCount can't tell which unseen copies sit in the wall vs in an
    // opponent's hand.
    const expectedFixedProbability = probabilityAtLeastOneDraw(
      wallCount,
      (liveCopies * wallCount) / (wallCount + othersHandCount),
      remainingDraws,
    );
    expect(actualScore).toBeCloseTo(
      nonProbabilityTerms + DEFAULT_JUNK_WEIGHTS.tenpaiProbabilityWeight * expectedFixedProbability,
      6,
    );

    // The bug this replaces: sampling `remainingDraws` from the *merged* pool
    // with the raw (unscaled) live-copy count as successCount — same draws
    // count but a bigger population, so it systematically understated the true
    // self-draw odds.
    const buggyMergedPoolProbability = probabilityAtLeastOneDraw(
      wallCount + othersHandCount,
      liveCopies,
      remainingDraws,
    );
    expect(expectedFixedProbability).toBeGreaterThan(buggyMergedPoolProbability);
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
