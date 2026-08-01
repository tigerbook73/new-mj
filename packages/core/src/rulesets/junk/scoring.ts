import type { TileKind } from "../../lib/ids.ts";

export type JunkScoringMeld = {
  type: "chi" | "peng" | "anGang" | "minGang" | "buGang";
  tiles: TileKind[];
};

export type JunkScoringInput = {
  /** Winner's complete concealed hand, including the winning tile. */
  hand: TileKind[];
  melds: JunkScoringMeld[];
  isDealer: boolean;
  winType: "zimo" | "ron";
  /** Consecutive gangs immediately preceding this self-draw. */
  gangChainLength: number;
};

export type JunkScoringResult = { fanTypes: string[]; multiplier: number };

const countKinds = (tiles: readonly TileKind[]): Map<TileKind, number> => {
  const counts = new Map<TileKind, number>();
  for (const tile of tiles) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  return counts;
};

// Mirrors lib/win.ts's isSevenPairsWinningHand strict count===2 definition (docs/variants/junk.md
// §3 "门前 14 张牌恰为七个对子") — kept as a separate TileKind-level check since scoring only ever
// sees the already-decomposed kind multiset, not TileId/TileSet; if either changes, check the other.
const isSevenPairs = (hand: readonly TileKind[], melds: readonly JunkScoringMeld[]): boolean =>
  melds.length === 0 &&
  hand.length === 14 &&
  [...countKinds(hand).values()].every((count) => count === 2);

const isPengpenghu = (hand: readonly TileKind[], melds: readonly JunkScoringMeld[]): boolean => {
  if (melds.some((meld) => meld.type === "chi")) return false;
  const remainders = [...countKinds(hand).values()].map((count) => count % 3);
  return (
    remainders.filter((count) => count === 2).length === 1 &&
    remainders.every((count) => count === 0 || count === 2)
  );
};

export const scoreJunkHand = (input: JunkScoringInput): JunkScoringResult => {
  const allTiles = [...input.hand, ...input.melds.flatMap((meld) => meld.tiles)];
  const suits = new Set(allTiles.filter((tile) => !tile.endsWith("z")).map((tile) => tile[1]));
  const hasHonors = allTiles.some((tile) => tile.endsWith("z"));
  const fanTypes: string[] = [];
  let multiplier = 1;
  const add = (fanType: string, factor: number) => {
    fanTypes.push(fanType);
    multiplier *= factor;
  };

  if (input.isDealer) add("dealer", 2);
  if (input.winType === "zimo" && input.gangChainLength > 0)
    add("gangkai", 2 ** input.gangChainLength);
  if (suits.size === 1 && hasHonors) add("hunYise", 2);
  if (suits.size === 1 && !hasHonors) add("qingYise", 4);
  if (isSevenPairs(input.hand, input.melds)) add("qixiaodui", 2);
  else if (isPengpenghu(input.hand, input.melds)) add("pengpenghu", 2);
  if (input.melds.every((meld) => meld.type === "anGang")) add("menqing", 2);
  return { fanTypes, multiplier };
};
