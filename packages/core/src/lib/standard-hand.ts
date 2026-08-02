import type { TileId, TileKind } from "./ids.ts";
import type { TileSet } from "./tiles.ts";

// 假设标准中国麻将花色编码（m/p/s/z）与"四组面子+一对"/七对规则；
// 虽然签名接受任意 TileSet，但不是通用算法——hangzhou 的癞子版本见
// rulesets/hangzhou/hand.ts，血战按花色计分的版本见 rulesets/bloodbattle/scoring.ts。
const isSuit = (kind: string): boolean =>
  kind.endsWith("m") || kind.endsWith("p") || kind.endsWith("s");

const canFormMelds = (counts: number[], tileSet: TileSet): boolean => {
  const index = counts.findIndex((count) => count > 0);
  if (index === -1) return true;
  if ((counts[index] ?? 0) >= 3) {
    const next = [...counts];
    next[index] = (next[index] ?? 0) - 3;
    if (canFormMelds(next, tileSet)) return true;
  }
  const kind = tileSet.kinds[index] as string;
  const rank = Number(kind[0]);
  const nextKinds = [`${rank + 1}${kind[1]}`, `${rank + 2}${kind[1]}`];
  const first = tileSet.kinds.indexOf(nextKinds[0] as never);
  const second = tileSet.kinds.indexOf(nextKinds[1] as never);
  if (
    isSuit(kind) &&
    rank <= 7 &&
    first >= 0 &&
    second >= 0 &&
    (counts[first] ?? 0) > 0 &&
    (counts[second] ?? 0) > 0
  ) {
    const next = [...counts];
    next[index] = (next[index] ?? 0) - 1;
    next[first] = (next[first] ?? 0) - 1;
    next[second] = (next[second] ?? 0) - 1;
    if (canFormMelds(next, tileSet)) return true;
  }
  return false;
};

/** Standard four-meld-plus-pair hand check; exposed melds are excluded by callers. */
export const isStandardWinningHand = (tiles: readonly TileId[], tileSet: TileSet): boolean => {
  if (tiles.length % 3 !== 2) return false;
  const counts = tileSet.kinds.map(() => 0);
  for (const tile of tiles) {
    const index = tileSet.kinds.indexOf(tileSet.kindOf(tile));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  for (let index = 0; index < counts.length; index += 1) {
    if ((counts[index] ?? 0) < 2) continue;
    const remaining = [...counts];
    remaining[index] = (remaining[index] ?? 0) - 2;
    if (canFormMelds(remaining, tileSet)) return true;
  }
  return false;
};

export const isSevenPairsWinningHand = (tiles: readonly TileId[], tileSet: TileSet): boolean => {
  if (tiles.length !== 14) return false;
  const counts = tileSet.kinds.map(() => 0);
  for (const tile of tiles) {
    const index = tileSet.kinds.indexOf(tileSet.kindOf(tile));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts.filter((count) => count > 0).every((count) => count === 2);
};

// Witness ("decompose") variants of the checks above: only called once, at
// the moment a win is actually declared, to reveal the specific melds/pair
// used — never on the isTingpai/isWin hot path, so a second, independent
// backtracking implementation (rather than threading an accumulator through
// canFormMelds) is an acceptable tradeoff. Branch order mirrors canFormMelds
// exactly so it explores the same decision tree.
const decomposeMelds = (counts: number[], tileSet: TileSet): TileKind[][] | undefined => {
  const index = counts.findIndex((count) => count > 0);
  if (index === -1) return [];
  const kind = tileSet.kinds[index] as TileKind;
  if ((counts[index] ?? 0) >= 3) {
    const next = [...counts];
    next[index] = (next[index] ?? 0) - 3;
    const rest = decomposeMelds(next, tileSet);
    if (rest) return [[kind, kind, kind], ...rest];
  }
  const rank = Number(kind[0]);
  const nextKinds = [`${rank + 1}${kind[1]}`, `${rank + 2}${kind[1]}`];
  const first = tileSet.kinds.indexOf(nextKinds[0] as never);
  const second = tileSet.kinds.indexOf(nextKinds[1] as never);
  if (
    isSuit(kind) &&
    rank <= 7 &&
    first >= 0 &&
    second >= 0 &&
    (counts[first] ?? 0) > 0 &&
    (counts[second] ?? 0) > 0
  ) {
    const next = [...counts];
    next[index] = (next[index] ?? 0) - 1;
    next[first] = (next[first] ?? 0) - 1;
    next[second] = (next[second] ?? 0) - 1;
    const rest = decomposeMelds(next, tileSet);
    if (rest) return [[kind, nextKinds[0] as TileKind, nextKinds[1] as TileKind], ...rest];
  }
  return undefined;
};

/** Witness version of isStandardWinningHand: returns the pair + melds actually used, or undefined. */
export const decomposeStandardWinningHand = (
  tiles: readonly TileId[],
  tileSet: TileSet,
): TileKind[][] | undefined => {
  if (tiles.length % 3 !== 2) return undefined;
  const counts = tileSet.kinds.map(() => 0);
  for (const tile of tiles) {
    const index = tileSet.kinds.indexOf(tileSet.kindOf(tile));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  for (let index = 0; index < counts.length; index += 1) {
    if ((counts[index] ?? 0) < 2) continue;
    const remaining = [...counts];
    remaining[index] = (remaining[index] ?? 0) - 2;
    const rest = decomposeMelds(remaining, tileSet);
    if (rest) {
      const kind = tileSet.kinds[index] as TileKind;
      return [[kind, kind], ...rest];
    }
  }
  return undefined;
};

/** Witness version of isSevenPairsWinningHand: reuses it for validity, just materializes the 7 groups. */
export const decomposeSevenPairsWinningHand = (
  tiles: readonly TileId[],
  tileSet: TileSet,
): TileKind[][] | undefined => {
  if (!isSevenPairsWinningHand(tiles, tileSet)) return undefined;
  const counts = new Map<TileKind, number>();
  for (const tile of tiles) {
    const kind = tileSet.kindOf(tile);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.keys()].map((kind) => [kind, kind]);
};
