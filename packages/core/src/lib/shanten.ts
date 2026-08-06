import type { TileId, TileKind } from "./ids.ts";
import { isSevenPairsWinningHand, isStandardWinningHand } from "./standard-hand.ts";
import { STANDARD_TILE_SET, type TileSet } from "./tiles.ts";

export type JunkShantenOptions = Readonly<{
  sevenPairs: boolean;
}>;

const isSuit = (kind: string): boolean =>
  kind.endsWith("m") || kind.endsWith("p") || kind.endsWith("s");

const countsOf = (tiles: readonly TileId[], tileSet: TileSet): number[] => {
  const counts = tileSet.kinds.map(() => 0);
  for (const tile of tiles) {
    const index = tileSet.kindIndexOf(tileSet.kindOf(tile));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
};

/**
 * 标准牌型向听数。递归枚举面子、雀头和搭子；副露应由调用方先从手牌中排除。
 *
 * `memo` 默认每次调用各自新建（行为与之前完全一致）；调用方可传入一个共享的
 * Map 跨多次调用复用缓存——例如 ukeire 要为同一手牌反复试探 30 余种不同的
 * 候选进张，这些递归子状态高度重叠，共享 memo 能省掉大量重复搜索（见 ukeire）。
 */
export const standardShanten = (
  tiles: readonly TileId[],
  tileSet: TileSet = STANDARD_TILE_SET,
  memo: Map<string, number> = new Map(),
): number => {
  const search = (counts: number[], melds: number, tatsu: number, pair: number): number => {
    const key = `${counts.join("")}/${melds}/${tatsu}/${pair}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const index = counts.findIndex((count) => count > 0);
    if (index === -1) {
      const usableTatsu = Math.min(tatsu, 4 - melds);
      const result = 8 - melds * 2 - usableTatsu - pair;
      memo.set(key, result);
      return result;
    }

    let best = Number.POSITIVE_INFINITY;
    const take = (
      indices: readonly number[],
      nextMelds = melds,
      nextTatsu = tatsu,
      nextPair = pair,
    ) => {
      const next = [...counts];
      for (const item of indices) next[item] = (next[item] ?? 0) - 1;
      best = Math.min(best, search(next, nextMelds, nextTatsu, nextPair));
    };
    const kind = tileSet.kinds[index] as string;
    const rank = Number(kind[0]);
    const sameSuitIndex = (offset: number): number =>
      tileSet.kindIndexOf(`${rank + offset}${kind[1]}` as TileKind);

    if ((counts[index] ?? 0) >= 3) take([index, index, index], melds + 1);
    if (isSuit(kind) && rank <= 7) {
      const second = sameSuitIndex(1);
      const third = sameSuitIndex(2);
      if (second >= 0 && third >= 0 && (counts[second] ?? 0) > 0 && (counts[third] ?? 0) > 0) {
        take([index, second, third], melds + 1);
      }
    }
    if ((counts[index] ?? 0) >= 2) {
      take([index, index], melds, tatsu, pair === 0 ? 1 : pair);
      if (pair !== 0) take([index, index], melds, tatsu + 1, pair);
    }
    if (isSuit(kind)) {
      const adjacent = sameSuitIndex(1);
      const gapped = sameSuitIndex(2);
      if (rank <= 8 && adjacent >= 0 && (counts[adjacent] ?? 0) > 0)
        take([index, adjacent], melds, tatsu + 1);
      if (rank <= 7 && gapped >= 0 && (counts[gapped] ?? 0) > 0)
        take([index, gapped], melds, tatsu + 1);
    }
    take([index]);
    memo.set(key, best);
    return best;
  };

  return search(countsOf(tiles, tileSet), 0, 0, 0);
};

export const sevenPairsShanten = (
  tiles: readonly TileId[],
  tileSet: TileSet = STANDARD_TILE_SET,
): number => {
  const counts = countsOf(tiles, tileSet);
  const pairs = counts.filter((count) => count >= 2).length;
  const kinds = counts.filter((count) => count > 0).length;
  return 6 - pairs + Math.max(0, 7 - kinds);
};

export const junkShanten = (
  tiles: readonly TileId[],
  options: JunkShantenOptions,
  tileSet: TileSet = STANDARD_TILE_SET,
  memo?: Map<string, number>,
): number =>
  options.sevenPairs
    ? Math.min(standardShanten(tiles, tileSet, memo), sevenPairsShanten(tiles, tileSet))
    : standardShanten(tiles, tileSet, memo);

/**
 * 会令向听数下降的牌种；不报告手中已经拿满的牌种。
 *
 * 这里要为同一手牌反复试探 30 余种候选进张，每种候选只比原手牌多一张牌，
 * 递归子状态高度重叠——共享同一个 memo（而不是让 junkShanten 内部各自新建）
 * 把这些搜索之间的重复计算省下来，结果不受影响（memo 只影响缓存命中，不
 * 影响 search 的返回值本身）。
 */
export const ukeire = (
  tiles: readonly TileId[],
  options: JunkShantenOptions,
  tileSet: TileSet = STANDARD_TILE_SET,
): TileKind[] => {
  const memo = new Map<string, number>();
  const current = junkShanten(tiles, options, tileSet, memo);
  const counts = countsOf(tiles, tileSet);
  return tileSet.kinds.filter((kind, index) => {
    if ((counts[index] ?? 0) >= tileSet.copiesPerKind) return false;
    const candidate = (index * tileSet.copiesPerKind) as TileId;
    return junkShanten([...tiles, candidate], options, tileSet, memo) < current;
  });
};

/** 听牌只描述下一张摸牌能否直接胡，不把普通进张误判为听牌。 */
export const isTingpai = (
  tiles: readonly TileId[],
  options: JunkShantenOptions,
  tileSet: TileSet = STANDARD_TILE_SET,
): boolean =>
  ukeire(tiles, options, tileSet).some((kind) => {
    const index = tileSet.kindIndexOf(kind);
    const candidate = (index * tileSet.copiesPerKind) as TileId;
    return (
      isStandardWinningHand([...tiles, candidate], tileSet) ||
      (options.sevenPairs && isSevenPairsWinningHand([...tiles, candidate], tileSet))
    );
  });
