import type { TileKind } from "@/lib/ids.ts";

// Tile-count convention (see docs/rules-bloodbattle.md "约定"): a kong
// (anGang/minGang/buGang) is always represented as a 4-tile entry in `melds`,
// never as four bare copies sitting in `hand` — except the seven-pairs family
// (七对/龙七对), where a "pair" being four-of-a-kind is the variant's own
// definition and must stay in `hand` (putting it in `melds` would disqualify
// the seven-pairs shape entirely). With N kongs, melds(4 tiles each) + hand +
// win.tile totals 14+N (each kong grants a replacement draw in real play).

export type BloodbattleScoringContext = {
  // by:"discard" immediately follows an opponent's kong-replacement draw → 杠上炮
  afterKong?: boolean;
  // this discard/self-draw is the wall's last drawable tile → 海底炮/海底捞月
  isLastTile?: boolean;
};

export type BloodbattleScoringInput = {
  config: { capFan: number | null; selfDrawBonus: "addFan" | "addBase" };
  hand: TileKind[];
  melds: Array<{ type: "peng" | "anGang" | "minGang" | "buGang"; tiles: TileKind[] }>;
  lack: "m" | "p" | "s";
  win: { tile: TileKind; by: "discard" | "zimo" | "robKong" | "kongFlower" };
  context?: BloodbattleScoringContext;
};

export type BloodbattleScoringResult =
  | { hu: true; fanTypes: string[]; fan: number; multiplier: number; cappedAt?: number }
  | { hu: false; reason: string };

type Suit = "m" | "p" | "s";
const SUITS: readonly Suit[] = ["m", "p", "s"];
const GANG_MELD_TYPES = new Set(["anGang", "minGang", "buGang"]);

const suitOf = (kind: TileKind): Suit => kind[1] as Suit;
const rankOf = (kind: TileKind): number => Number(kind[0]);

const countByKind = (kinds: readonly TileKind[]): Map<TileKind, number> => {
  const counts = new Map<TileKind, number>();
  for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return counts;
};

const rankCounts = (kinds: readonly TileKind[], suit: Suit): number[] => {
  const counts = Array<number>(9).fill(0);
  for (const kind of kinds) {
    if (suitOf(kind) !== suit) continue;
    const rankIndex = rankOf(kind) - 1;
    counts[rankIndex] = (counts[rankIndex] ?? 0) + 1;
  }
  return counts;
};

// Whether a single suit's rank-count array can be fully split into triplets
// (and, unless tripletsOnly, runs). The lowest active rank is always forced
// into either a triplet (if it has 3+) or the start of a run — same shape as
// win.ts's canFormMelds, kept separate here since this operates on plain
// rank-count arrays (no TileId/TileSet indirection needed for kind-level fixtures).
const canDecomposeSuit = (counts: readonly number[], tripletsOnly: boolean): boolean => {
  const index = counts.findIndex((count) => count > 0);
  if (index === -1) return true;
  if (counts[index]! >= 3) {
    const next = [...counts];
    next[index] = next[index]! - 3;
    if (canDecomposeSuit(next, tripletsOnly)) return true;
  }
  if (!tripletsOnly && index <= 6 && (counts[index + 1] ?? 0) > 0 && (counts[index + 2] ?? 0) > 0) {
    const next = [...counts];
    next[index] = next[index]! - 1;
    next[index + 1] = next[index + 1]! - 1;
    next[index + 2] = next[index + 2]! - 1;
    if (canDecomposeSuit(next, tripletsOnly)) return true;
  }
  return false;
};

// Tries every possible pair placement, then requires the remainder to fully
// decompose (across all three suits) into `meldsNeeded` triplets/runs.
const canFormMeldsAndPair = (
  tiles: readonly TileKind[],
  meldsNeeded: number,
  tripletsOnly: boolean,
): boolean => {
  if (tiles.length !== meldsNeeded * 3 + 2) return false;
  const bySuit = new Map(SUITS.map((suit) => [suit, rankCounts(tiles, suit)] as const));
  for (const suit of SUITS) {
    const counts = bySuit.get(suit)!;
    for (let rank = 0; rank < 9; rank += 1) {
      if (counts[rank]! < 2) continue;
      const withoutPair = counts.map((count, index) => (index === rank ? count - 2 : count));
      const ok = SUITS.every((candidate) =>
        canDecomposeSuit(candidate === suit ? withoutPair : bySuit.get(candidate)!, tripletsOnly),
      );
      if (ok) return true;
    }
  }
  return false;
};

// Total tile count varies with how many of the 7 "pairs" are actually a quad
// (14 + 2 per quad — each quad is 2 tiles heavier than a pair), so this
// can't short-circuit on a fixed length; the count-shape check below is
// the only validity condition.
const trySevenPairsFamily = (
  tiles: readonly TileKind[],
): { fanTypes: string[]; fan: number } | undefined => {
  const counts = [...countByKind(tiles).values()];
  if (counts.length !== 7 || !counts.every((count) => count === 2 || count === 4)) return undefined;
  const quadCount = counts.filter((count) => count === 4).length;
  if (quadCount === 0) return { fanTypes: ["qiduizi"], fan: 2 };
  // First quad is already folded into 龙七对's base 3 fan; each extra quad
  // beyond the first adds its own +1 gen (rules-bloodbattle.md §4).
  const extraGen = quadCount - 1;
  return {
    fanTypes: ["longqidui", ...Array<string>(extraGen).fill("gen")],
    fan: 3 + extraGen,
  };
};

const isAllPairs = (tiles: readonly TileKind[]): boolean =>
  tiles.length > 0 && [...countByKind(tiles).values()].every((count) => count % 2 === 0);

const finalize = (
  baseFanTypes: readonly string[],
  baseFan: number,
  input: BloodbattleScoringInput,
  allTiles: readonly TileKind[],
): BloodbattleScoringResult => {
  const fanTypes = [...baseFanTypes];
  let fan = baseFan;

  if (new Set(allTiles.map(suitOf)).size === 1) {
    fanTypes.push("qingyise");
    fan += 2;
  }

  const gangCount = input.melds.filter((meld) => GANG_MELD_TYPES.has(meld.type)).length;
  for (let index = 0; index < gangCount; index += 1) {
    fanTypes.push("gen");
    fan += 1;
  }

  const { win, context, config } = input;
  const isSelfDraw = win.by === "zimo" || win.by === "kongFlower";
  if (isSelfDraw && config.selfDrawBonus === "addFan") {
    fanTypes.push("zimo");
    fan += 1;
  }
  if (win.by === "kongFlower") {
    fanTypes.push("gangshanghua");
    fan += 1;
  }
  if (win.by === "discard" && context?.afterKong) {
    fanTypes.push("gangshangpao");
    fan += 1;
  }
  if (win.by === "robKong") {
    fanTypes.push("qiangganghu");
    fan += 1;
  }
  if (win.by === "zimo" && context?.isLastTile) {
    fanTypes.push("haidilaoyue");
    fan += 1;
  }
  if (win.by === "discard" && context?.isLastTile) {
    fanTypes.push("haidipao");
    fan += 1;
  }

  const { capFan } = config;
  const multiplier = capFan === null ? 2 ** fan : 2 ** Math.min(fan, capFan);
  return capFan !== null && fan >= capFan
    ? { hu: true, fanTypes, fan, multiplier, cappedAt: capFan }
    : { hu: true, fanTypes, fan, multiplier };
};

/**
 * Scores a completed bloodbattle hand against the fan-type table in
 * rules-bloodbattle.md §4. Base types are tried in order of structural
 * specificity (金钩钓 → 七对/龙七对 → 对对胡 → 平胡) and are mutually
 * exclusive; additive and operational fans layer on top of whichever base matched.
 */
export const scoreBloodbattleHand = (input: BloodbattleScoringInput): BloodbattleScoringResult => {
  const { hand, melds, lack, win } = input;
  const meldTiles = melds.flatMap((meld) => meld.tiles);
  const allTiles = [...hand, ...meldTiles, win.tile];

  if (allTiles.some((tile) => suitOf(tile) === lack)) {
    return { hu: false, reason: "LACK_SUIT_PRESENT" };
  }

  if (melds.length === 4 && hand.length === 1) {
    return finalize(["jingoudiao"], 1, input, allTiles);
  }

  const completeConcealed = [...hand, win.tile];

  if (melds.length === 0) {
    const sevenPairs = trySevenPairsFamily(completeConcealed);
    if (sevenPairs) return finalize(sevenPairs.fanTypes, sevenPairs.fan, input, allTiles);
  }

  const meldsNeeded = 4 - melds.length;
  if (meldsNeeded >= 0) {
    if (canFormMeldsAndPair(completeConcealed, meldsNeeded, true)) {
      return finalize(["duiduihu"], 1, input, allTiles);
    }
    if (canFormMeldsAndPair(completeConcealed, meldsNeeded, false)) {
      return finalize(["pinghu"], 0, input, allTiles);
    }
  }

  if (melds.length > 0 && isAllPairs(hand)) {
    return { hu: false, reason: "SEVEN_PAIRS_WITH_MELDS" };
  }
  return { hu: false, reason: "NOT_A_WINNING_SHAPE" };
};
