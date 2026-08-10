import {
  STANDARD_TILE_SET,
  type JunkAction,
  type JunkPlayerView,
  type Meld,
  type TileId,
  type TileKind,
} from "@new-mj/core";
import { createJunkAnalysisCache, type JunkAnalysisCache, type ShapeInput } from "./analysis.ts";
import {
  bestDiscardScore,
  createLiveCopyContext,
  handQuality,
  removeTiles,
  scoreHandShapeAfterDiscard,
  type GameProgress,
} from "./hand-quality.ts";
import { probeSelfDrawTwoPly } from "./two-ply.ts";
import { DEFAULT_JUNK_WEIGHTS, type JunkWeights } from "./weights.ts";

const kindOf = (tile: TileId): TileKind => STANDARD_TILE_SET.kindOf(tile);

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

const opponentMelds = (view: JunkPlayerView): Meld[] =>
  view.seats.flatMap((seat, seatIndex) =>
    seatIndex === view.seat ? [] : seat.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
  );

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

type RankedTwoPlyDiscard = Readonly<{
  kind: TileKind;
  discard: TileId;
  rankScore: number;
}>;

type TwoPlyCliffConfig = Readonly<{
  upper: Readonly<{ minN: number; maxN: number; relativeGap: number }>;
  lower: Readonly<{ minN: number; maxN: number | "all"; relativeGap: number }>;
}>;

const DEFAULT_TWO_PLY_CLIFF_CONFIG: TwoPlyCliffConfig = {
  upper: { minN: 2, maxN: 4, relativeGap: 0.2 },
  lower: { minN: 1, maxN: "all", relativeGap: 0.2 },
};

const suitTrajectoryBonusAfterDiscard = (
  input: ShapeInput,
  discard: TileId,
  weights: JunkWeights,
): number => {
  const hand = input.hand.filter((tile) => tile !== discard);
  const suitCounts = [0, 0, 0];
  let honorCount = 0;
  for (const tile of [...hand, ...input.melds.flatMap((meld) => meld.tiles)]) {
    const kind = kindOf(tile);
    if (kind.endsWith("z")) honorCount += 1;
    else suitCounts[kind[1] === "m" ? 0 : kind[1] === "p" ? 1 : 2]! += 1;
  }
  const suitedCount = suitCounts.reduce((sum, count) => sum + count, 0);
  if (suitedCount === 0) return 0;
  const dominantSuitCount = Math.max(...suitCounts);
  const offSuitCount = suitedCount - dominantSuitCount;
  if (dominantSuitCount < 8 || dominantSuitCount <= offSuitCount) return 0;
  const routeSignal = Math.max(
    0,
    (honorCount > 0 ? dominantSuitCount + honorCount : dominantSuitCount) - offSuitCount - 1,
  );
  return (routeSignal * (honorCount > 0 ? weights.hunyise : weights.qingyise)) / 8;
};

const validateTwoPlyCliffConfig = (config: TwoPlyCliffConfig): void => {
  if (
    !Number.isSafeInteger(config.upper.minN) ||
    !Number.isSafeInteger(config.upper.maxN) ||
    config.upper.minN <= 0 ||
    config.upper.maxN < config.upper.minN ||
    config.upper.relativeGap < 0 ||
    !Number.isSafeInteger(config.lower.minN) ||
    config.lower.minN <= 0 ||
    (config.lower.maxN !== "all" &&
      (!Number.isSafeInteger(config.lower.maxN) || config.lower.maxN < config.lower.minN)) ||
    config.lower.relativeGap < 0
  )
    throw new Error("invalid two-ply cliff config");
};

const rankTwoPlyDiscards = (
  input: ShapeInput,
  visibleDiscards: readonly TileId[],
  weights: JunkWeights,
  gameProgress: GameProgress,
  memo: Map<string, number>,
  analysisCache: JunkAnalysisCache,
  additionalMelds: readonly Meld[],
): RankedTwoPlyDiscard[] => {
  const uniqueDiscards = new Map<TileKind, TileId>();
  for (const tile of input.hand) {
    const kind = kindOf(tile);
    if (!uniqueDiscards.has(kind)) uniqueDiscards.set(kind, tile);
  }
  return [...uniqueDiscards.entries()]
    .map(([kind, discard]) => ({
      kind,
      discard,
      rankScore:
        scoreHandShapeAfterDiscard(
          input,
          discard,
          visibleDiscards,
          weights,
          memo,
          gameProgress,
          createLiveCopyContext(input, visibleDiscards, additionalMelds),
          analysisCache,
        ) + suitTrajectoryBonusAfterDiscard(input, discard, weights),
    }))
    .sort((left, right) => right.rankScore - left.rankScore);
};

const relativeScoreRange = (ranked: readonly RankedTwoPlyDiscard[]): number =>
  ranked.length < 2 ? 0 : ranked[0]!.rankScore - ranked[ranked.length - 1]!.rankScore;

const upperTwoPlyLimit = (
  ranked: readonly RankedTwoPlyDiscard[],
  config: TwoPlyCliffConfig["upper"],
): number => {
  const minimum = Math.min(config.minN, ranked.length);
  const maximum = Math.min(config.maxN, ranked.length);
  if (minimum === 0) return 0;
  const range = relativeScoreRange(ranked);
  if (range <= 0) return maximum;
  for (let index = minimum; index < maximum; index += 1) {
    if ((ranked[index - 1]!.rankScore - ranked[index]!.rankScore) / range >= config.relativeGap)
      return index;
  }
  return maximum;
};

const lowerTwoPlyLimit = (
  ranked: readonly RankedTwoPlyDiscard[],
  config: TwoPlyCliffConfig["lower"],
): number => {
  const minimum = Math.min(config.minN, ranked.length);
  const maximum = config.maxN === "all" ? ranked.length : Math.min(config.maxN, ranked.length);
  if (ranked.length === 0) return 0;
  const range = relativeScoreRange(ranked);
  if (range <= 0) return maximum;
  for (let index = ranked.length - 1; index >= minimum; index -= 1) {
    if ((ranked[index - 1]!.rankScore - ranked[index]!.rankScore) / range >= config.relativeGap)
      return Math.min(Math.max(index, minimum), maximum);
  }
  return maximum;
};

const scoreTwoPlyDiscards = (
  view: JunkPlayerView,
  discardActions: readonly Extract<JunkAction, { type: "discard" }>[],
  weights: JunkWeights,
  memo: Map<string, number>,
  analysisCache: JunkAnalysisCache,
  allCandidates = false,
): Map<TileKind, number> => {
  // The first round is intentionally cheap and bounded. The second round keeps
  // the exact branch result, but only for the upper candidates; the lower cliff
  // supplies a whitelist for the best subsequent discard after each draw.
  validateTwoPlyCliffConfig(DEFAULT_TWO_PLY_CLIFF_CONFIG);
  const input = { hand: view.hand, melds: view.seats[view.seat]!.melds };
  const discards = visibleDiscards(view);
  const progress = gameProgressOf(view);
  const publicMelds = opponentMelds(view);
  const ranked = rankTwoPlyDiscards(
    input,
    discards,
    weights,
    progress,
    memo,
    analysisCache,
    publicMelds,
  );
  const upperLimit = allCandidates
    ? ranked.length
    : upperTwoPlyLimit(ranked, DEFAULT_TWO_PLY_CLIFF_CONFIG.upper);
  const lowerLimit = allCandidates
    ? ranked.length
    : lowerTwoPlyLimit(ranked, DEFAULT_TWO_PLY_CLIFF_CONFIG.lower);
  const secondWhitelist = new Set(ranked.slice(0, lowerLimit).map(({ kind }) => kind));
  const scores = new Map<TileKind, number>();
  const actionKinds = new Set(discardActions.map(({ tile }) => kindOf(tile)));
  for (const { kind, discard } of ranked.slice(0, upperLimit)) {
    if (!actionKinds.has(kind)) continue;
    const afterDiscard = {
      hand: input.hand.filter((tile) => tile !== discard),
      melds: input.melds,
    };
    const probe = probeSelfDrawTwoPly(
      afterDiscard,
      [...discards, discard],
      weights,
      progress,
      analysisCache,
      (drawnKind) => new Set([...secondWhitelist, drawnKind]),
      {
        tiles: input.hand,
        discardKindIndex: STANDARD_TILE_SET.kindIndexOf(kind),
      },
      publicMelds,
    );
    // 没有可抽牌的分支，或包含立即自摸分支时，暂不把未建模的终局收益混入
    // 生产评分；交给一轮评分作为稳定 fallback。
    if (probe.outcomes.length === 0 || probe.winProbability > 0) continue;
    const discardSafety = discards.includes(discard) ? weights.safetyBonus : 0;
    scores.set(kind, probe.continuationValue + discardSafety);
  }
  return scores;
};

const scoreAction = (
  view: JunkPlayerView,
  action: JunkAction,
  weights: JunkWeights,
  memo: Map<string, number>,
  analysisCache?: JunkAnalysisCache,
): number => {
  const discards = visibleDiscards(view);
  const currentMelds = view.seats[view.seat]!.melds;
  const gameProgress = gameProgressOf(view);
  const publicMelds = opponentMelds(view);
  if (action.type === "discard") {
    return scoreHandShapeAfterDiscard(
      { hand: view.hand, melds: currentMelds },
      action.tile,
      discards,
      weights,
      memo,
      gameProgress,
      createLiveCopyContext({ hand: view.hand, melds: currentMelds }, discards, publicMelds),
      analysisCache,
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
      createLiveCopyContext({ hand: view.hand, melds: currentMelds }, discards, publicMelds),
      analysisCache,
    );
  if (action.type === "anGang") {
    const claim = simulatedAnGang(view, action.kind);
    return claim
      ? handQuality(
          claim,
          weights,
          memo,
          discards,
          undefined,
          gameProgress,
          createLiveCopyContext(claim, discards, publicMelds),
          analysisCache,
        ) + weights.gangkai
      : -100;
  }
  if (action.type === "buGang") {
    const claim = simulatedBuGang(view, action.tile);
    return claim
      ? handQuality(
          claim,
          weights,
          memo,
          discards,
          undefined,
          gameProgress,
          createLiveCopyContext(claim, discards, publicMelds),
          analysisCache,
        ) +
          (weights.gangkai - weights.buGangPenalty)
      : -100;
  }
  const claim = simulatedClaim(view, action);
  if (!claim) return -100;
  const hurdle = action.type === "chi" ? weights.chiHurdle : weights.pengHurdle;
  return (
    bestDiscardScore(
      claim,
      discards,
      weights,
      memo,
      gameProgress,
      createLiveCopyContext(claim, discards, publicMelds),
      analysisCache,
    ) - hurdle
  );
};

export type ScoredAction = { action: JunkAction; score: number };

/** Exposed (beyond recommendJunkAction's own use) so diagnostic/tuning scripts can
 * inspect per-action scores directly — e.g. measuring how large a margin a claim
 * beats pass by, which recommendJunkAction's return value alone can't answer. */
export const scoreLegalActions = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
  weights: JunkWeights,
  analysisCache?: JunkAnalysisCache,
): ScoredAction[] => {
  // One memo shared across every candidate this turn evaluates — see shantenOf's
  // doc comment for why that turns overlapping recursive sub-searches into cache
  // hits instead of each candidate re-deriving them from scratch.
  const memo = new Map<string, number>();
  const structuralCache = analysisCache ?? createJunkAnalysisCache();
  const discardScores = new Map<TileKind, number>();
  const discardActions = legalActions.filter(
    (action): action is Extract<JunkAction, { type: "discard" }> => action.type === "discard",
  );
  const twoPlyScores =
    discardActions.length > 0
      ? scoreTwoPlyDiscards(view, discardActions, weights, memo, structuralCache)
      : new Map<TileKind, number>();
  return legalActions.map((action) => ({
    action,
    score:
      action.type !== "discard"
        ? scoreAction(view, action, weights, memo, structuralCache)
        : (discardScores.get(kindOf(action.tile)) ??
          (() => {
            const calculated =
              twoPlyScores.get(kindOf(action.tile)) ??
              scoreAction(view, action, weights, memo, structuralCache);
            discardScores.set(kindOf(action.tile), calculated);
            return calculated;
          })()),
  }));
};

/** Diagnostic one-ply view over every legal action; production behavior is unchanged. */
export const scoreLegalActionsOnePlyAll = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  analysisCache: JunkAnalysisCache = createJunkAnalysisCache(),
): ScoredAction[] => {
  const memo = new Map<string, number>();
  return legalActions.map((action) => ({
    action,
    score: scoreAction(view, action, weights, memo, analysisCache),
  }));
};

/** Slow diagnostic path: run the existing two-ply continuation over every discard kind. */
export const scoreDiscardActionsTwoPlyAll = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  analysisCache: JunkAnalysisCache = createJunkAnalysisCache(),
): ScoredAction[] => {
  const discardActions = legalActions.filter(
    (action): action is Extract<JunkAction, { type: "discard" }> => action.type === "discard",
  );
  const memo = new Map<string, number>();
  const scores = scoreTwoPlyDiscards(view, discardActions, weights, memo, analysisCache, true);
  return discardActions.map((action) => ({
    action,
    score:
      scores.get(kindOf(action.tile)) ?? scoreAction(view, action, weights, memo, analysisCache),
  }));
};
