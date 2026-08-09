import {
  STANDARD_TILE_SET,
  evaluateUkeireBatch,
  evaluateUkeire,
  shantenWithExposedMelds,
  tileIdOf,
  ukeire,
  type JunkAction,
  type JunkPlayerView,
  type Meld,
  type TileId,
  type TileKind,
  type UkeireEvaluation,
} from "@new-mj/core";
import defaultWeightsData from "./default-weights.json" with { type: "json" };
import { probabilityAtLeastOneDraw } from "./tile-probability.ts";

/** Every magic number that shapes handQuality/fanPotential/scoreAction, made
 * overridable so an offline tuner (see junk/tune.ts) can search this space
 * instead of it being hand-picked. */
export type JunkWeights = {
  qidui: number;
  pengpenghu: number;
  menqing: number;
  qingyise: number;
  hunyise: number;
  gangkai: number;
  /** buGang bonus = gangkai - buGangPenalty (upgrading a peng is less disruptive than a fresh anGang). */
  buGangPenalty: number;
  /** fanPotential: bonus per closed pair, when no chi melds exist. */
  pairBonus: number;
  /** fanPotential: bonus per non-chi meld, when no chi melds exist. */
  meldBonus: number;
  /** fanPotential: seven-pairs-trajectory bonus while no melds exist yet. */
  qiduiPotential: number;
  /** handQuality: shanten weight (-shanten * shantenWeight). */
  shantenWeight: number;
  /** handQuality: weight on the *probability* of drawing an improving tile within
   * the seat's estimated remaining draws this game (see tile-probability.ts and
   * GameProgress) — not a raw live-copy count. A wait backed by more live copies
   * still scores higher (probability rises with successCount), but the same live
   * count is worth less late in the wall than early, which a flat per-copy weight
   * could never express. */
  tenpaiProbabilityWeight: number;
  /** scoreHandShapeAfterDiscard: bonus for discarding an already-visible tile. */
  safetyBonus: number;
  /** handQuality: flat bonus for a concealed, unpaired suited tile that has no
   * same-suit tile within two ranks (a genuine floating tile, not mid-run/tatsu
   * material already scored elsewhere). Honor tiles get nothing — they can only
   * ever pair, never form a run — so this is what makes discarding an isolated
   * honor outscore discarding an isolated number tile even while shanten ties. */
  isolationPotential: number;
  /** scoreAction: flat penalty subtracted from a chi claim's score before it's
   * compared against pass — a margin the claim must clear, not just beat pass
   * by any amount. handQuality already prices in chi's certain costs (loses
   * menqing, forecloses pengpenghu), but that point estimate carries real
   * uncertainty (known gaps: no opponent-behavior model, no zimo/peng/chi
   * channel split — see docs/process/junk-ai-decision-quality.md); requiring a
   * clear margin guards against committing to an irreversible open hand over a
   * claim that only *looks* better because of the formula's own noise. */
  chiHurdle: number;
  /** Same idea as chiHurdle, for peng/minGang — smaller by default since those
   * only cost menqing, not pengpenghu too (see the same doc's note correcting
   * an earlier claim that chi also costs qingyise — it doesn't). */
  pengHurdle: number;
};

/** Loaded from default-weights.json rather than hardcoded here, so adopting a
 * tuned candidate (junk/tune-cli.ts --write) is a data-file edit, not a code
 * change. Frozen so an accidental in-place mutation (e.g. a `mutate()` bug that
 * forgets to spread) throws immediately in strict mode instead of silently
 * corrupting the shared default for every future call. */
export const DEFAULT_JUNK_WEIGHTS: JunkWeights = Object.freeze({ ...defaultWeightsData });

/** The original hand-picked fan-type weights, kept as a stable named export for
 * any existing import. Derived from DEFAULT_JUNK_WEIGHTS (not a second literal)
 * so it can never drift out of sync with the JSON file. */
export const JUNK_FAN_WEIGHTS = {
  qidui: DEFAULT_JUNK_WEIGHTS.qidui,
  pengpenghu: DEFAULT_JUNK_WEIGHTS.pengpenghu,
  menqing: DEFAULT_JUNK_WEIGHTS.menqing,
  qingyise: DEFAULT_JUNK_WEIGHTS.qingyise,
  hunyise: DEFAULT_JUNK_WEIGHTS.hunyise,
  gangkai: DEFAULT_JUNK_WEIGHTS.gangkai,
} as const;

type ShapeInput = Readonly<{ hand: readonly TileId[]; melds: readonly Meld[] }>;

type LiveCopyContext = Readonly<{
  meldCounts: Uint8Array;
  discardCounts: Uint8Array;
}>;

type HandAnalysisCache = Map<string, UkeireEvaluation>;

const kindOf = (tile: TileId): TileKind => STANDARD_TILE_SET.kindOf(tile);
const kindIndexOf = (kind: TileKind): number => STANDARD_TILE_SET.kindIndexOf(kind);

const countsOf = (tiles: readonly TileId[]): Uint8Array => {
  const counts = new Uint8Array(STANDARD_TILE_SET.kinds.length);
  for (const tile of tiles) counts[kindIndexOf(kindOf(tile))]! += 1;
  return counts;
};

const handAnalysisKey = (input: ShapeInput): string => {
  const counts = countsOf(input.hand);
  return `${input.melds.length}/${input.melds.length === 0 ? 1 : 0}/${counts.join("")}`;
};

const handAnalysisOf = (input: ShapeInput, cache?: HandAnalysisCache): UkeireEvaluation => {
  if (!cache) {
    return evaluateUkeire(
      input.hand,
      { sevenPairs: input.melds.length === 0 },
      STANDARD_TILE_SET,
      input.melds.length,
    );
  }
  const key = handAnalysisKey(input);
  const cached = cache.get(key);
  if (cached) return cached;
  const analysis = evaluateUkeire(
    input.hand,
    { sevenPairs: input.melds.length === 0 },
    STANDARD_TILE_SET,
    input.melds.length,
  );
  cache.set(key, analysis);
  return analysis;
};
const removeTiles = (hand: readonly TileId[], tiles: readonly TileId[]): TileId[] | undefined => {
  const remaining = [...hand];
  for (const tile of tiles) {
    const index = remaining.indexOf(tile);
    if (index < 0) return undefined;
    remaining.splice(index, 1);
  }
  return remaining;
};

const fanPotential = (input: ShapeInput, weights: JunkWeights): number => {
  const all = [...input.hand, ...input.melds.flatMap((meld) => meld.tiles)].map(kindOf);
  const suits = new Set(all.filter((kind) => !kind.endsWith("z")).map((kind) => kind[1]));
  const hasHonor = all.some((kind) => kind.endsWith("z"));
  const opened = input.melds.some((meld) => meld.type !== "anGang");
  let score = opened ? 0 : weights.menqing;
  if (suits.size === 1) score += hasHonor ? weights.hunyise : weights.qingyise;
  if (input.melds.every((meld) => meld.type !== "chi")) {
    const counts = new Map<TileKind, number>();
    for (const tile of input.hand) counts.set(kindOf(tile), (counts.get(kindOf(tile)) ?? 0) + 1);
    score += [...counts.values()].filter((count) => count >= 2).length * weights.pairBonus;
    score += input.melds.filter((meld) => meld.type !== "chi").length * weights.meldBonus;
    // 无 chi 副露即仍走在碰碰胡轨道上（呼应 core scoring.ts 里 isPengPengHu
    // 的判定条件：家族为 standard 且没有任何 chi 副露）；这里只按同一条件给
    // 一个固定加成，不逐搭子计分——真正是否成型由 meldBonus/shanten 收敛。
    score += weights.pengpenghu;
  }
  if (input.melds.length === 0) score += weights.qiduiPotential;
  return score;
};

/**
 * Rewards keeping a concealed suited tile that still has run-forming upside,
 * over keeping an isolated honor that never will — independent of shanten, so
 * it breaks ties even outside the shanten<=1 window where `improvements` is 0
 * (early/mid-game discards, where standardShanten's isolated-tile branch scores
 * honors and numbers identically; see plan.md's "AI Bot 启发式质量盲点").
 *
 * A tile only counts as "isolated" here if it has no pair (scored via
 * pairBonus already) and no same-suit tile within two ranks (already counted
 * as a run/tatsu by shantenOf) — otherwise this would double-pay tiles that
 * shanten already rewards for being connected.
 *
 * `referenceHand` (defaults to `hand`) is used only for the neighbor lookup —
 * it must be the hand *before* the candidate discard under evaluation, not
 * `hand` itself. Without this, discarding one tile of a tatsu (e.g. 6p out of
 * 5p6p) makes the surviving 5p look newly "isolated" in the post-discard hand
 * and collects this bonus — rewarding the act of breaking a tatsu instead of
 * genuinely-isolated tiles that were never connected to begin with.
 */
const isolationPotential = (
  hand: readonly TileId[],
  weights: JunkWeights,
  referenceHand: readonly TileId[] = hand,
): number => {
  const counts = new Map<TileKind, number>();
  for (const tile of hand) {
    const kind = kindOf(tile);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const referenceCounts = new Map<TileKind, number>();
  for (const tile of referenceHand) {
    const kind = kindOf(tile);
    referenceCounts.set(kind, (referenceCounts.get(kind) ?? 0) + 1);
  }
  let score = 0;
  for (const [kind, count] of counts) {
    if (count >= 2 || kind.endsWith("z")) continue;
    const rank = Number(kind[0]);
    const suit = kind[1];
    const hasNeighbor = [-2, -1, 1, 2].some(
      (offset) => (referenceCounts.get(`${rank + offset}${suit}` as TileKind) ?? 0) > 0,
    );
    if (!hasNeighbor) score += weights.isolationPotential;
  }
  return score;
};

/**
 * `memo` is optional and, when given, shared with shantenWithExposedMelds'
 * internal recursive cache — the caller (scoreLegalActions) creates ONE memo
 * per turn and threads it through every candidate hand it evaluates. Those
 * hands mostly differ from each other by a single tile, so their recursive
 * shanten sub-searches overlap heavily; sharing the memo (instead of each
 * call starting a fresh one) turns most of that overlap into cache hits
 * without changing any returned value — memo only affects what gets cached,
 * not what a given recursive state computes to.
 */
const shantenOf = (input: ShapeInput, memo?: Map<string, number>): number =>
  shantenWithExposedMelds(input.hand, input.melds.length, STANDARD_TILE_SET, memo);

/**
 * Sums *remaining live copies* of each improving kind (4 minus copies already
 * accounted for in this hand, this seat's own melds, and anyone's discard pile —
 * including tombstones of claimed discards, since a claimed tile's id stays in
 * the original discard entry). Known gap: a kind locked into another seat's
 * anGang/buGang never passed through a discard, so those copies aren't
 * subtracted — the count can overstate liveness in that case. Two waits with
 * the same *kind* count can differ wildly in how many tiles are actually still
 * drawable; this is what makes handQuality prefer the live one over the dead one.
 */
const liveUkeireCount = (
  input: ShapeInput,
  kinds: readonly TileKind[],
  visibleDiscards: readonly TileId[],
  context?: LiveCopyContext,
): number => {
  const handCounts = countsOf(input.hand);
  let total = 0;
  for (const kind of kinds) {
    total += remainingLiveCopies(input, kind, visibleDiscards, context, handCounts);
  }
  return total;
};

const remainingLiveCopies = (
  input: ShapeInput,
  kind: TileKind,
  visibleDiscards: readonly TileId[],
  context?: LiveCopyContext,
  handCounts?: Uint8Array,
): number => {
  const index = kindIndexOf(kind);
  const known = context
    ? (handCounts ?? countsOf(input.hand))[index]! +
      context.meldCounts[index]! +
      context.discardCounts[index]!
    : input.hand.filter((tile) => kindOf(tile) === kind).length +
      input.melds.flatMap((meld) => meld.tiles).filter((tile) => kindOf(tile) === kind).length +
      visibleDiscards.filter((tile) => kindOf(tile) === kind).length;
  return Math.max(0, STANDARD_TILE_SET.copiesPerKind - known);
};

/**
 * The two numbers `handQuality` needs to turn a live-copy count into a draw
 * probability: how many tiles are still unaccounted for from this seat's
 * point of view, and how many more times this seat is expected to draw this
 * game. `remainingDraws` is estimated as `ceil(wallCount / 4)` — the four
 * seats draw in strict rotation, so this is exact when no one calls a tile
 * out of turn; claims (chi/peng/gang) skip other seats' draws and shift the
 * rotation, which this estimate doesn't model. Known simplification, same
 * spirit as liveUkeireCount's anGang/buGang gap above.
 */
export type GameProgress = Readonly<{
  wallCount: number;
  /** wallCount plus every other seat's concealed hand — tiles whose identity
   * is unknown to this seat, so from this seat's subjective epistemic state
   * a given live copy is exchangeably likely to be sitting in the wall or in
   * an opponent's hand (deal was uniform random). handQuality uses this only
   * to estimate what *share* of a kind's live copies are expected to be in
   * the wall right now (see wallShare below) — the actual draw simulation
   * samples from `wallCount` alone, since a self-draw physically only pulls
   * from the wall, never from an opponent's concealed hand. */
  unseenPoolSize: number;
}>;

/** Default for callers that don't track game progress (most direct unit-test
 * calls into scoreHandShapeAfterDiscard) — a full, untouched wall, so the
 * probability term behaves as "plenty of time left" rather than being
 * silently zeroed out. */
const AMPLE_GAME_PROGRESS: GameProgress = {
  wallCount: STANDARD_TILE_SET.kinds.length * STANDARD_TILE_SET.copiesPerKind,
  unseenPoolSize: STANDARD_TILE_SET.kinds.length * STANDARD_TILE_SET.copiesPerKind,
};

/**
 * Shared quality metric for a static hand shape (no pending discard) — the common
 * scale that discard/pass/gang scoring all compare against, so "do nothing" and
 * "change my hand" are judged on the same terms instead of hardcoded constants.
 */
const handQuality = (
  input: ShapeInput,
  weights: JunkWeights,
  memo?: Map<string, number>,
  visibleDiscards: readonly TileId[] = [],
  isolationReferenceHand: readonly TileId[] = input.hand,
  gameProgress: GameProgress = AMPLE_GAME_PROGRESS,
  liveCopyContext?: LiveCopyContext,
  analysisCache?: HandAnalysisCache,
): number => {
  const analysis = handAnalysisOf(input, analysisCache);
  const shanten = analysis.shanten;
  // 曾经只在 shanten<=1 时才算 ukeire（避免中局无收益穷举），实测这个门槛让
  // 中局"留一手换未来更多可能性"这类判断完全看不到进张信号——shanten/ukeire
  // 性能提升后，无条件计算的开销经基准测试确认可接受（1000 场自对弈从 10.5s
  // 涨到 16.4s，约 1.56x，不是数量级级别的暴涨），于是把门槛去掉。ukeire 自己
  // 内部已经在 34 种候选进张之间共享 memo（见 core 的 shanten.ts），这里的
  // memo 是另一层——同一回合不同候选弃牌之间共享，两者互补、互不冲突。
  //
  // existingMelds 必须传 input.melds.length：ukeire 内部按"搭子数上限
  // min(tatsu, 4-已有面子数)"给候选封顶，遗漏这个偏移会让有副露的手牌把不
  // 真正降向听的牌种也报成进张（2026-08-08 修复，见 shanten.ts ukeire 的
  // 文档注释与 shanten.test.ts 的回归用例）。
  const improvements = liveUkeireCount(
    input,
    analysis.improvingKinds,
    visibleDiscards,
    liveCopyContext,
  );
  const remainingDraws = Math.ceil(gameProgress.wallCount / 4);
  // Self-draws physically only pull from the wall — never from an opponent's
  // concealed hand — so the draw simulation must sample from `wallCount`, not
  // `unseenPoolSize` (wallCount + opponents' hands). But `improvements` counts
  // live copies across *both* locations (liveUkeireCount can't see into hidden
  // opponent hands), so it overstates what's actually drawable this way. Since
  // this seat can't tell which unseen copies sit where, the two locations are
  // exchangeable from its point of view (see GameProgress) — the expected
  // number actually in the wall is `improvements` scaled by the wall's share
  // of the whole unseen pool. This only fixes the self-draw channel; claiming
  // an improving tile via a future peng/chi off an opponent's discard is a
  // separate, harder-to-model channel (needs opponent-behavior assumptions)
  // and stays untouched here — see plan.md's backlog note on this gap.
  const wallShare =
    gameProgress.unseenPoolSize > 0
      ? (improvements * gameProgress.wallCount) / gameProgress.unseenPoolSize
      : 0;
  const tenpaiProbability = probabilityAtLeastOneDraw(
    gameProgress.wallCount,
    wallShare,
    remainingDraws,
  );
  return (
    -shanten * weights.shantenWeight +
    tenpaiProbability * weights.tenpaiProbabilityWeight +
    fanPotential(input, weights) +
    isolationPotential(input.hand, weights, isolationReferenceHand)
  );
};

/** Shared primitive for discard and claim evaluation: preserve shape, then score its best discard. */
export const scoreHandShapeAfterDiscard = (
  input: ShapeInput,
  discard: TileId,
  visibleDiscards: readonly TileId[] = [],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  memo?: Map<string, number>,
  gameProgress: GameProgress = AMPLE_GAME_PROGRESS,
  liveCopyContext?: LiveCopyContext,
  analysisCache?: HandAnalysisCache,
): number => {
  const hand = removeTiles(input.hand, [discard]);
  if (!hand) return Number.NEGATIVE_INFINITY;
  const safety = visibleDiscards.includes(discard) ? weights.safetyBonus : 0;
  return (
    handQuality(
      { hand, melds: input.melds },
      weights,
      memo,
      visibleDiscards,
      input.hand,
      gameProgress,
      liveCopyContext,
      analysisCache,
    ) + safety
  );
};

/** Duplicate copies of the same kind produce the same resulting hand once
 * removed — memoize by kind (mirrors scoreLegalActions' discard memo) instead
 * of rescoring every physical tile. */
const bestDiscardScore = (
  input: ShapeInput,
  visibleDiscards: readonly TileId[],
  weights: JunkWeights,
  memo: Map<string, number> | undefined,
  gameProgress: GameProgress,
  liveCopyContext?: LiveCopyContext,
  analysisCache?: HandAnalysisCache,
): number => {
  const scores = new Map<TileKind, number>();
  let best = Number.NEGATIVE_INFINITY;
  for (const tile of input.hand) {
    const kind = kindOf(tile);
    const score =
      scores.get(kind) ??
      (() => {
        const calculated = scoreHandShapeAfterDiscard(
          input,
          tile,
          visibleDiscards,
          weights,
          memo,
          gameProgress,
          liveCopyContext,
          analysisCache,
        );
        scores.set(kind, calculated);
        return calculated;
      })();
    if (score > best) best = score;
  }
  return best;
};

export type SelfDrawTwoPlyOutcome = Readonly<{
  kind: TileKind;
  probability: number;
  /** Undefined for an immediate win: this probe deliberately does not invent
   * a terminal payout model and therefore never asks the bot to discard a
   * winning 14-tile hand. */
  leafScore?: number;
}>;

export type SelfDrawTwoPlyProbe = Readonly<{
  /** Sum of probabilities represented by non-winning outcomes. */
  continuationProbability: number;
  /** Sum of probability × leaf score for non-winning outcomes. This is not a
   * complete action score until a future terminal-win payout is added. */
  continuationValue: number;
  /** Probability that the next self-draw immediately wins. */
  winProbability: number;
  outcomes: readonly SelfDrawTwoPlyOutcome[];
}>;

/**
 * A deliberately narrow 2-ply probe for Phase 2 exploration:
 *
 *   post-discard hand -> next *self* draw -> best subsequent discard -> leaf quality
 *
 * Every hidden copy is assigned its visible-information probability: under the
 * same exchangeability assumption as handQuality, kind k has probability
 * `remainingCopies(k) / unseenPoolSize` of being our next wall draw. The wall
 * share cancels out here because E[wall copies] / wallCount = live copies /
 * unseenPoolSize. Opponent discards, chi/peng opportunities, and terminal win
 * payouts are intentionally outside this probe; immediate wins are reported
 * separately rather than incorrectly forcing a discard from the winning hand.
 *
 * This is not wired into default policy yet. Its fixture behavior and benchmark
 * are the evidence gate for deciding whether it may become a scoring feature.
 */
export const probeSelfDrawTwoPly = (
  input: ShapeInput,
  visibleDiscards: readonly TileId[] = [],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  gameProgress: GameProgress = AMPLE_GAME_PROGRESS,
): SelfDrawTwoPlyProbe => {
  if (gameProgress.unseenPoolSize <= 0 || gameProgress.wallCount <= 0)
    return { continuationProbability: 0, continuationValue: 0, winProbability: 0, outcomes: [] };

  const memo = new Map<string, number>();
  const analysisCache: HandAnalysisCache = new Map();
  const liveCopyContext: LiveCopyContext = {
    meldCounts: countsOf(input.melds.flatMap((meld) => meld.tiles)),
    discardCounts: countsOf(visibleDiscards),
  };
  let continuationProbability = 0;
  let continuationValue = 0;
  let winProbability = 0;
  const outcomes: SelfDrawTwoPlyOutcome[] = [];
  const occupied = new Set([
    ...input.hand,
    ...input.melds.flatMap((meld) => meld.tiles),
    ...visibleDiscards,
  ]);
  const drawCandidates: {
    kind: TileKind;
    probability: number;
    afterDraw: ShapeInput;
  }[] = [];
  for (const kind of STANDARD_TILE_SET.kinds) {
    const remaining = remainingLiveCopies(input, kind, visibleDiscards, liveCopyContext);
    if (remaining === 0) continue;
    const probability = remaining / gameProgress.unseenPoolSize;
    const drawnTile = Array.from({ length: STANDARD_TILE_SET.copiesPerKind }, (_, copy) =>
      tileIdOf(kind, copy),
    ).find((tile) => !occupied.has(tile));
    if (drawnTile === undefined) continue;
    drawCandidates.push({
      kind,
      probability,
      afterDraw: { hand: [...input.hand, drawnTile], melds: input.melds },
    });
  }
  const drawAnalyses = evaluateUkeireBatch(
    drawCandidates.map(({ afterDraw }) => ({
      tiles: afterDraw.hand,
      options: { sevenPairs: afterDraw.melds.length === 0 },
      existingMelds: afterDraw.melds.length,
    })),
  );
  for (const [index, { kind, probability, afterDraw }] of drawCandidates.entries()) {
    const analysis = drawAnalyses[index]!;
    analysisCache.set(handAnalysisKey(afterDraw), analysis);
    if (analysis.shanten < 0) {
      winProbability += probability;
      outcomes.push({ kind, probability });
      continue;
    }

    const leafScore = bestDiscardScore(
      afterDraw,
      visibleDiscards,
      weights,
      memo,
      gameProgress,
      liveCopyContext,
      analysisCache,
    );
    continuationProbability += probability;
    continuationValue += probability * leafScore;
    outcomes.push({ kind, probability, leafScore });
  }
  return { continuationProbability, continuationValue, winProbability, outcomes };
};

const simulatedClaim = (view: JunkPlayerView, action: JunkAction): ShapeInput | undefined => {
  const claimTile = view.lastDiscard?.tile;
  if (!claimTile) return undefined;
  if (action.type === "chi") {
    const hand = removeTiles(view.hand, action.tiles);
    return hand
      ? {
          hand,
          melds: [
            ...view.seats[view.seat]!.melds,
            { type: "chi", tiles: [...action.tiles, claimTile] },
          ],
        }
      : undefined;
  }
  if (action.type !== "peng" && action.type !== "minGang") return undefined;
  const needed = action.type === "peng" ? 2 : 3;
  const matching = view.hand.filter((tile) => kindOf(tile) === kindOf(claimTile)).slice(0, needed);
  const hand = removeTiles(view.hand, matching);
  return hand
    ? {
        hand,
        melds: [
          ...view.seats[view.seat]!.melds,
          { type: action.type, tiles: [...matching, claimTile] },
        ],
      }
    : undefined;
};

/** anGang consumes all 4 concealed copies of `kind` into a new concealed meld. */
const simulatedAnGang = (view: JunkPlayerView, kind: TileKind): ShapeInput | undefined => {
  const tiles = view.hand.filter((tile) => kindOf(tile) === kind).slice(0, 4);
  if (tiles.length !== 4) return undefined;
  const hand = removeTiles(view.hand, tiles);
  return hand
    ? { hand, melds: [...view.seats[view.seat]!.melds, { type: "anGang", tiles }] }
    : undefined;
};

/** buGang upgrades an existing peng meld with the 4th copy drawn into hand. */
const simulatedBuGang = (view: JunkPlayerView, tile: TileId): ShapeInput | undefined => {
  const kind = kindOf(tile);
  const melds = view.seats[view.seat]!.melds;
  const pengIndex = melds.findIndex(
    (meld) => meld.type === "peng" && kindOf(meld.tiles[0]!) === kind,
  );
  if (pengIndex < 0) return undefined;
  const hand = removeTiles(view.hand, [tile]);
  if (!hand) return undefined;
  const upgraded: Meld = {
    ...melds[pengIndex]!,
    type: "buGang",
    tiles: [...melds[pengIndex]!.tiles, tile],
  };
  const nextMelds = [...melds];
  nextMelds[pengIndex] = upgraded;
  return { hand, melds: nextMelds };
};

const visibleDiscards = (view: JunkPlayerView): TileId[] =>
  view.seats.flatMap((seat) => seat.discards.map((discard) => discard.tile));

/** unseenPoolSize = wallCount + every *other* seat's concealed hand (own hand is
 * fully known, so it's excluded); see GameProgress's doc comment for why this
 * pool is treated as exchangeable for a draw-probability estimate. */
const gameProgressOf = (view: JunkPlayerView): GameProgress => {
  const othersHandCount = view.seats.reduce(
    (sum, seat, seatIndex) => (seatIndex === view.seat ? sum : sum + seat.handCount),
    0,
  );
  return { wallCount: view.wallCount, unseenPoolSize: view.wallCount + othersHandCount };
};

const scoreAction = (
  view: JunkPlayerView,
  action: JunkAction,
  weights: JunkWeights,
  memo: Map<string, number>,
): number => {
  const discards = visibleDiscards(view);
  const currentMelds = view.seats[view.seat]!.melds;
  const gameProgress = gameProgressOf(view);
  if (action.type === "discard") {
    return scoreHandShapeAfterDiscard(
      { hand: view.hand, melds: currentMelds },
      action.tile,
      discards,
      weights,
      memo,
      gameProgress,
    );
  }
  // pass 的基线是"手牌原样不动"的当前质量，而不是任意常数——这样才能和
  // 吃/碰/杠模拟出的结果分数放在同一把尺子上比较，AI 才可能真的选择不动。
  if (action.type === "pass")
    return handQuality(
      { hand: view.hand, melds: currentMelds },
      weights,
      memo,
      discards,
      undefined,
      gameProgress,
    );
  if (action.type === "anGang") {
    const claim = simulatedAnGang(view, action.kind);
    return claim
      ? handQuality(claim, weights, memo, discards, undefined, gameProgress) + weights.gangkai
      : -100;
  }
  if (action.type === "buGang") {
    const claim = simulatedBuGang(view, action.tile);
    return claim
      ? handQuality(claim, weights, memo, discards, undefined, gameProgress) +
          (weights.gangkai - weights.buGangPenalty)
      : -100;
  }
  const claim = simulatedClaim(view, action);
  if (!claim) return -100;
  const hurdle = action.type === "chi" ? weights.chiHurdle : weights.pengHurdle;
  return bestDiscardScore(claim, discards, weights, memo, gameProgress) - hurdle;
};

/**
 * Softmax temperature knob for action sampling. Omitted or <= 0 reproduces the
 * previous deterministic argmax bit-for-bit. `random` defaults to Math.random for
 * zero-config production use (bot autoplay / advice); inject a seeded generator
 * (e.g. a closure over @new-mj/core's createPrng/nextUint32) for reproducible
 * self-play/arena runs.
 */
export type JunkStrengthConfig = {
  temperature?: number;
  random?: () => number;
};

export type ScoredAction = { action: JunkAction; score: number };

/** Exposed (beyond recommendJunkAction's own use) so diagnostic/tuning scripts can
 * inspect per-action scores directly — e.g. measuring how large a margin a claim
 * beats pass by, which recommendJunkAction's return value alone can't answer. */
export const scoreLegalActions = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
  weights: JunkWeights,
): ScoredAction[] => {
  // One memo shared across every candidate this turn evaluates — see shantenOf's
  // doc comment for why that turns overlapping recursive sub-searches into cache
  // hits instead of each candidate re-deriving them from scratch.
  const memo = new Map<string, number>();
  const discardScores = new Map<TileKind, number>();
  return legalActions.map((action) => ({
    action,
    score:
      action.type !== "discard"
        ? scoreAction(view, action, weights, memo)
        : (discardScores.get(kindOf(action.tile)) ??
          (() => {
            const calculated = scoreAction(view, action, weights, memo);
            discardScores.set(kindOf(action.tile), calculated);
            return calculated;
          })()),
  }));
};

const argmaxAction = (scored: readonly ScoredAction[]): JunkAction | undefined => {
  let best: JunkAction | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const { action, score } of scored) {
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  return best;
};

/**
 * Numerically-stable softmax sampling over precomputed action scores (max-subtraction
 * keeps the -100/-Infinity sentinels used elsewhere in this file from producing NaN —
 * they naturally collapse to ~0 weight instead of needing special-casing).
 */
const sampleSoftmax = (
  scored: readonly ScoredAction[],
  temperature: number,
  random: () => number,
): JunkAction | undefined => {
  if (scored.length === 0) return undefined;
  const maxScore = Math.max(...scored.map(({ score }) => score));
  const weights = scored.map(({ score }) => Math.exp((score - maxScore) / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const threshold = random() * total;
  let cumulative = 0;
  for (const [index, weight] of weights.entries()) {
    cumulative += weight;
    if (threshold < cumulative) return scored[index]!.action;
  }
  return scored[scored.length - 1]!.action;
};

export const recommendJunkAction = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
  strength: JunkStrengthConfig = {},
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
): JunkAction | undefined => {
  const winning = legalActions.find((action) => action.type === "hu" || action.type === "zimo");
  if (winning) return winning;
  const scored = scoreLegalActions(view, legalActions, weights);
  const temperature = strength.temperature ?? 0;
  if (temperature <= 0) return argmaxAction(scored);
  return sampleSoftmax(scored, temperature, strength.random ?? Math.random);
};

export const chooseJunkAction = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
  strength: JunkStrengthConfig = {},
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
): JunkAction => {
  const action = recommendJunkAction(view, legalActions, strength, weights);
  if (!action) throw new Error("chooseJunkAction called with no legal actions");
  return action;
};
