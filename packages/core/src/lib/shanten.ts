import type { TileId, TileKind } from "./ids.ts";
import { computeShantenViaTable } from "./shanten-suit-table.ts";
import { isSevenPairsWinningHand, isStandardWinningHand } from "./standard-hand.ts";
import { STANDARD_TILE_SET, type TileSet } from "./tiles.ts";

export type ShantenOptions = Readonly<{
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
 * 标准牌型向听数的递归实现：枚举面子、雀头和搭子；副露应由调用方先从手牌中
 * 排除。`standardShanten` 只在 `tileSet` 不是 `STANDARD_TILE_SET`（引用相等）
 * 时才回退到这里——标准 34 种牌走 shanten-suit-table.ts 的预计算表查表快路径，
 * 语义必须与这里逐位一致（差分测试见 shanten-suit-table.test.ts）。
 *
 * `memo` 默认每次调用各自新建（行为与之前完全一致）；调用方可传入一个共享的
 * Map 跨多次调用复用缓存——例如 ukeire 要为同一手牌反复试探 30 余种不同的
 * 候选进张，这些递归子状态高度重叠，共享 memo 能省掉大量重复搜索（见 ukeire）。
 */
const standardShantenByRecursion = (
  tiles: readonly TileId[],
  tileSet: TileSet = STANDARD_TILE_SET,
  memo: Map<string, number> = new Map(),
  existingMelds = 0,
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

  return search(countsOf(tiles, tileSet), existingMelds, 0, 0);
};

/**
 * 标准牌型向听数。`tileSet === STANDARD_TILE_SET`（引用相等，因为它是
 * frozen 单例）时走 shanten-suit-table.ts 的 Layer 0 预计算表查表快路径
 * （`computeShantenViaTable`），O(1) 量级；任何非标准 `TileSet`（比如未被
 * 实际使用的 27-kind `BLOODBATTLE_TILE_SET`）回退到
 * `standardShantenByRecursion`，保持通用性不受影响。
 *
 * `memo` 只在回退路径上有意义（见 `standardShantenByRecursion` 的文档）；
 * 快路径本身就是 O(1) 查表 + 一个很小的合并 DP，不需要、也不使用 memo。
 */
export const standardShanten = (
  tiles: readonly TileId[],
  tileSet: TileSet = STANDARD_TILE_SET,
  memo: Map<string, number> = new Map(),
  existingMelds = 0,
): number =>
  tileSet === STANDARD_TILE_SET
    ? computeShantenViaTable(tiles, tileSet, existingMelds)
    : standardShantenByRecursion(tiles, tileSet, memo, existingMelds);

/**
 * standardShanten 只看得到手牌自己找到的面子数；已有副露的面子并不在
 * `tiles` 里，需要作为 `exposedMelds` 传入才能让内部的搭子上限
 * `min(tatsu, 4-melds)` 与已报副露共同封顶 `4-总面子数`，否则副露越多、
 * 手里搭子越多时会算出偏乐观的向听数（副露越多能"免费"用的搭子应该越
 * 少，不是维持在 4 不变）。sevenPairs 不与副露共存（报出副露后手牌结构
 * 就不可能再凑成七对），所以只在 `exposedMelds === 0` 时纳入比较。
 */
export const shantenWithExposedMelds = (
  concealedTiles: readonly TileId[],
  exposedMelds: number,
  tileSet: TileSet = STANDARD_TILE_SET,
  memo?: Map<string, number>,
): number => {
  const standard = standardShanten(concealedTiles, tileSet, memo, exposedMelds);
  return exposedMelds > 0
    ? standard
    : Math.min(standard, sevenPairsShanten(concealedTiles, tileSet));
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

/**
 * 玩法无关的标准型/七对二选一向听数：`sevenPairs` 只是一个开关，函数本身
 * 不含任何玩法专属逻辑（原名 `junkShanten` 是历史遗留，实际不只 junk 在用）。
 */
export const computeShanten = (
  tiles: readonly TileId[],
  options: ShantenOptions,
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
 * 递归子状态高度重叠——共享同一个 memo（而不是让 computeShanten 内部各自新建）
 * 把这些搜索之间的重复计算省下来，结果不受影响（memo 只影响缓存命中，不
 * 影响 search 的返回值本身）。
 */
export const ukeire = (
  tiles: readonly TileId[],
  options: ShantenOptions,
  tileSet: TileSet = STANDARD_TILE_SET,
): TileKind[] => {
  const memo = new Map<string, number>();
  const current = computeShanten(tiles, options, tileSet, memo);
  const counts = countsOf(tiles, tileSet);
  return tileSet.kinds.filter((kind, index) => {
    if ((counts[index] ?? 0) >= tileSet.copiesPerKind) return false;
    const candidate = (index * tileSet.copiesPerKind) as TileId;
    return computeShanten([...tiles, candidate], options, tileSet, memo) < current;
  });
};

/** 听牌只描述下一张摸牌能否直接胡，不把普通进张误判为听牌。 */
export const isTingpai = (
  tiles: readonly TileId[],
  options: ShantenOptions,
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
