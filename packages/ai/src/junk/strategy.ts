import {
  STANDARD_TILE_SET,
  sevenPairsShanten,
  standardShanten,
  ukeire,
  type JunkAction,
  type JunkPlayerView,
  type Meld,
  type TileId,
  type TileKind,
} from "@new-mj/core";
import defaultWeightsData from "./default-weights.json" with { type: "json" };

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
  /** handQuality: ukeire-improvement weight, applied per live tile still available
   * (4 - copies in own hand/melds - copies visible in any seat's discards), not
   * per improving *kind* — a wait with 3 live copies outscores one with 1. */
  improvementWeight: number;
  /** scoreHandShapeAfterDiscard: bonus for discarding an already-visible tile. */
  safetyBonus: number;
  /** handQuality: flat bonus for a concealed, unpaired suited tile that has no
   * same-suit tile within two ranks (a genuine floating tile, not mid-run/tatsu
   * material already scored elsewhere). Honor tiles get nothing — they can only
   * ever pair, never form a run — so this is what makes discarding an isolated
   * honor outscore discarding an isolated number tile even while shanten ties. */
  isolationPotential: number;
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

const kindOf = (tile: TileId): TileKind => STANDARD_TILE_SET.kindOf(tile);
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
 */
const isolationPotential = (hand: readonly TileId[], weights: JunkWeights): number => {
  const counts = new Map<TileKind, number>();
  for (const tile of hand) {
    const kind = kindOf(tile);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  let score = 0;
  for (const [kind, count] of counts) {
    if (count >= 2 || kind.endsWith("z")) continue;
    const rank = Number(kind[0]);
    const suit = kind[1];
    const hasNeighbor = [-2, -1, 1, 2].some(
      (offset) => (counts.get(`${rank + offset}${suit}` as TileKind) ?? 0) > 0,
    );
    if (!hasNeighbor) score += weights.isolationPotential;
  }
  return score;
};

/**
 * standardShanten/sevenPairsShanten only look at the concealed tiles handed to
 * them — they assume all 4 melds still have to come from that array. A seat
 * with existing melds (chi/peng/gang) already has some of those 4 melds "for
 * free", so each existing meld is worth exactly 2 shanten points back (one of
 * the classic shanten-calculator adjustments); qidui is impossible once any
 * meld exists (its hand can never be all-concealed pairs again).
 */
/**
 * `memo` is optional and, when given, shared with standardShanten's internal
 * recursive cache — the caller (scoreLegalActions) creates ONE memo per turn and
 * threads it through every candidate hand it evaluates. Those hands mostly differ
 * from each other by a single tile, so their recursive shanten sub-searches
 * overlap heavily; sharing the memo (instead of each call starting a fresh one,
 * standardShanten's own default) turns most of that overlap into cache hits
 * without changing any returned value — memo only affects what gets cached, not
 * what a given recursive state computes to.
 */
const shantenOf = (input: ShapeInput, memo?: Map<string, number>): number => {
  const meldCount = input.melds.length;
  const standard = standardShanten(input.hand, undefined, memo);
  const raw = meldCount > 0 ? standard : Math.min(standard, sevenPairsShanten(input.hand));
  return raw - meldCount * 2;
};

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
): number => {
  let total = 0;
  for (const kind of kinds) {
    const known =
      input.hand.filter((tile) => kindOf(tile) === kind).length +
      input.melds.flatMap((meld) => meld.tiles).filter((tile) => kindOf(tile) === kind).length +
      visibleDiscards.filter((tile) => kindOf(tile) === kind).length;
    total += Math.max(0, STANDARD_TILE_SET.copiesPerKind - known);
  }
  return total;
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
): number => {
  const shanten = shantenOf(input, memo);
  // 进张枚举会再求 34 次向听数；离听牌尚远时，先以向听数本身做筛选即可，
  // 避免自动对局在每一次出牌都做无收益的二层穷举。ukeire 内部的向听差值不
  // 受副露数量的常数偏移影响，因此这里不需要把偏移传进去。ukeire 自己内部
  // 已经在 34 种候选进张之间共享 memo（见 core 的 shanten.ts），这里的 memo
  // 是另一层——同一回合不同候选弃牌之间共享，两者互补、互不冲突。
  const improvingKinds =
    shanten <= 1 ? ukeire(input.hand, { sevenPairs: input.melds.length === 0 }) : [];
  const improvements = liveUkeireCount(input, improvingKinds, visibleDiscards);
  return (
    -shanten * weights.shantenWeight +
    improvements * weights.improvementWeight +
    fanPotential(input, weights) +
    isolationPotential(input.hand, weights)
  );
};

/** Shared primitive for discard and claim evaluation: preserve shape, then score its best discard. */
export const scoreHandShapeAfterDiscard = (
  input: ShapeInput,
  discard: TileId,
  visibleDiscards: readonly TileId[] = [],
  weights: JunkWeights = DEFAULT_JUNK_WEIGHTS,
  memo?: Map<string, number>,
): number => {
  const hand = removeTiles(input.hand, [discard]);
  if (!hand) return Number.NEGATIVE_INFINITY;
  const safety = visibleDiscards.includes(discard) ? weights.safetyBonus : 0;
  return handQuality({ hand, melds: input.melds }, weights, memo, visibleDiscards) + safety;
};

/** Duplicate copies of the same kind produce the same resulting hand once
 * removed — memoize by kind (mirrors scoreLegalActions' discard memo) instead
 * of rescoring every physical tile. */
const bestDiscardScore = (
  input: ShapeInput,
  visibleDiscards: readonly TileId[],
  weights: JunkWeights,
  memo?: Map<string, number>,
): number => {
  const scores = new Map<TileKind, number>();
  let best = Number.NEGATIVE_INFINITY;
  for (const tile of input.hand) {
    const kind = kindOf(tile);
    const score =
      scores.get(kind) ??
      (() => {
        const calculated = scoreHandShapeAfterDiscard(input, tile, visibleDiscards, weights, memo);
        scores.set(kind, calculated);
        return calculated;
      })();
    if (score > best) best = score;
  }
  return best;
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
  const upgraded: Meld = { ...melds[pengIndex]!, type: "buGang", tiles: [...melds[pengIndex]!.tiles, tile] };
  const nextMelds = [...melds];
  nextMelds[pengIndex] = upgraded;
  return { hand, melds: nextMelds };
};

const visibleDiscards = (view: JunkPlayerView): TileId[] =>
  view.seats.flatMap((seat) => seat.discards.map((discard) => discard.tile));

const scoreAction = (
  view: JunkPlayerView,
  action: JunkAction,
  weights: JunkWeights,
  memo: Map<string, number>,
): number => {
  const discards = visibleDiscards(view);
  const currentMelds = view.seats[view.seat]!.melds;
  if (action.type === "discard") {
    return scoreHandShapeAfterDiscard(
      { hand: view.hand, melds: currentMelds },
      action.tile,
      discards,
      weights,
      memo,
    );
  }
  // pass 的基线是"手牌原样不动"的当前质量，而不是任意常数——这样才能和
  // 吃/碰/杠模拟出的结果分数放在同一把尺子上比较，AI 才可能真的选择不动。
  if (action.type === "pass")
    return handQuality({ hand: view.hand, melds: currentMelds }, weights, memo, discards);
  if (action.type === "anGang") {
    const claim = simulatedAnGang(view, action.kind);
    return claim ? handQuality(claim, weights, memo, discards) + weights.gangkai : -100;
  }
  if (action.type === "buGang") {
    const claim = simulatedBuGang(view, action.tile);
    return claim
      ? handQuality(claim, weights, memo, discards) + (weights.gangkai - weights.buGangPenalty)
      : -100;
  }
  const claim = simulatedClaim(view, action);
  if (claim) return bestDiscardScore(claim, discards, weights, memo);
  return -100;
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

type ScoredAction = { action: JunkAction; score: number };

const scoreLegalActions = (
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
