import {
  STANDARD_TILE_SET,
  junkShanten,
  ukeire,
  type JunkAction,
  type JunkPlayerView,
  type Meld,
  type TileId,
  type TileKind,
} from "@new-mj/core";

export const JUNK_FAN_WEIGHTS = {
  qidui: 14,
  pengpenghu: 10,
  menqing: 8,
  qingyise: 20,
  hunyise: 9,
  gangkai: 5,
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

const fanPotential = (input: ShapeInput): number => {
  const all = [...input.hand, ...input.melds.flatMap((meld) => meld.tiles)].map(kindOf);
  const suits = new Set(all.filter((kind) => !kind.endsWith("z")).map((kind) => kind[1]));
  const hasHonor = all.some((kind) => kind.endsWith("z"));
  const opened = input.melds.some((meld) => meld.type !== "anGang");
  let score = opened ? 0 : JUNK_FAN_WEIGHTS.menqing;
  if (suits.size === 1) score += hasHonor ? JUNK_FAN_WEIGHTS.hunyise : JUNK_FAN_WEIGHTS.qingyise;
  if (input.melds.every((meld) => meld.type !== "chi")) {
    const counts = new Map<TileKind, number>();
    for (const tile of input.hand) counts.set(kindOf(tile), (counts.get(kindOf(tile)) ?? 0) + 1);
    score += [...counts.values()].filter((count) => count >= 2).length * 2;
    score += input.melds.filter((meld) => meld.type !== "chi").length * 3;
  }
  if (input.melds.length === 0) score += JUNK_FAN_WEIGHTS.qidui / 4;
  return score;
};

/** Shared primitive for discard and claim evaluation: preserve shape, then score its best discard. */
export const scoreHandShapeAfterDiscard = (
  input: ShapeInput,
  discard: TileId,
  visibleDiscards: readonly TileId[] = [],
): number => {
  const hand = removeTiles(input.hand, [discard]);
  if (!hand) return Number.NEGATIVE_INFINITY;
  const shanten = junkShanten(hand, { sevenPairs: true });
  // 进张枚举会再求 34 次向听数；离听牌尚远时，先以向听数本身做筛选即可，
  // 避免自动对局在每一次出牌都做无收益的二层穷举。
  const improvements = shanten <= 1 ? ukeire(hand, { sevenPairs: true }).length : 0;
  const safety = visibleDiscards.includes(discard) ? 4 : 0;
  return -shanten * 100 + improvements * 3 + fanPotential({ hand, melds: input.melds }) + safety;
};

const bestDiscardScore = (input: ShapeInput, visibleDiscards: readonly TileId[]): number =>
  Math.max(...input.hand.map((tile) => scoreHandShapeAfterDiscard(input, tile, visibleDiscards)));

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

const visibleDiscards = (view: JunkPlayerView): TileId[] =>
  view.seats.flatMap((seat) => seat.discards.map((discard) => discard.tile));

const scoreAction = (view: JunkPlayerView, action: JunkAction): number => {
  const discards = visibleDiscards(view);
  if (action.type === "discard") {
    return scoreHandShapeAfterDiscard(
      { hand: view.hand, melds: view.seats[view.seat]!.melds },
      action.tile,
      discards,
    );
  }
  if (action.type === "anGang") return JUNK_FAN_WEIGHTS.gangkai;
  if (action.type === "buGang") return JUNK_FAN_WEIGHTS.gangkai - 2;
  const claim = simulatedClaim(view, action);
  if (claim) return bestDiscardScore(claim, discards);
  return action.type === "pass" ? -1_000 : -100;
};

export const recommendJunkAction = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): JunkAction | undefined => {
  const winning = legalActions.find((action) => action.type === "hu" || action.type === "zimo");
  if (winning) return winning;
  let best: JunkAction | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  const discardScores = new Map<TileKind, number>();
  for (const action of legalActions) {
    const score =
      action.type !== "discard"
        ? scoreAction(view, action)
        : (discardScores.get(kindOf(action.tile)) ??
          (() => {
            const calculated = scoreAction(view, action);
            discardScores.set(kindOf(action.tile), calculated);
            return calculated;
          })());
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  return best;
};

export const chooseJunkAction = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): JunkAction => {
  const action = recommendJunkAction(view, legalActions);
  if (!action) throw new Error("chooseJunkAction called with no legal actions");
  return action;
};
