import type { TileId, TileKind } from "./ids.ts";
import { computeShantenFromCounts, computeShantenViaTable } from "./shanten-suit-table.ts";
import { createShantenProber, createTwoChangeShantenProber } from "./shanten-prober.ts";
import { STANDARD_TILE_SET, type TileSet } from "./tiles.ts";

export type ShantenOptions = Readonly<{
  sevenPairs: boolean;
}>;

export type UkeireEvaluation = Readonly<{
  shanten: number;
  improvingKinds: readonly TileKind[];
}>;

export type UkeireBatchInput = Readonly<{
  tiles: readonly TileId[];
  options: ShantenOptions;
  existingMelds?: number;
}>;

export type UkeireAfterDiscardEvaluation = Readonly<{
  discardKindIndex: number;
  shanten: number;
  improvingKinds: readonly TileKind[];
}>;

export type UkeireAfterDiscardDrawEvaluation = Readonly<{
  discardKindIndex: number;
  drawKindIndex: number;
  shanten: number;
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
 * 快路径本身就是 O(1) 查表 + 一个很小的合并 DP，不需要、也不使用 memo——
 * 所以这里不给 memo 默认值（默认值在回退实现里），避免快路径每次调用都
 * 白白分配一个 Map。
 */
export const standardShanten = (
  tiles: readonly TileId[],
  tileSet: TileSet = STANDARD_TILE_SET,
  memo?: Map<string, number>,
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

const sevenPairsShantenFromCounts = (counts: readonly number[]): number => {
  let pairs = 0;
  let kinds = 0;
  for (const count of counts) {
    if (count >= 2) pairs += 1;
    if (count > 0) kinds += 1;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
};

export const sevenPairsShanten = (
  tiles: readonly TileId[],
  tileSet: TileSet = STANDARD_TILE_SET,
): number => sevenPairsShantenFromCounts(countsOf(tiles, tileSet));

/**
 * 玩法无关的标准型/七对二选一向听数：`sevenPairs` 只是一个开关，函数本身
 * 不含任何玩法专属逻辑（原名 `junkShanten` 是历史遗留，实际不只 junk 在用）。
 */
export const computeShanten = (
  tiles: readonly TileId[],
  options: ShantenOptions,
  tileSet: TileSet = STANDARD_TILE_SET,
  memo?: Map<string, number>,
  existingMelds = 0,
): number =>
  options.sevenPairs
    ? Math.min(
        standardShanten(tiles, tileSet, memo, existingMelds),
        sevenPairsShanten(tiles, tileSet),
      )
    : standardShanten(tiles, tileSet, memo, existingMelds);

/**
 * 会令向听数下降的牌种；不报告手中已经拿满的牌种。
 *
 * `existingMelds` 语义与 `shantenWithExposedMelds` 一致：副露的面子不在
 * `tiles` 里，必须单独传入才能让内部的搭子上限 `min(tatsu, 4-melds)` 与已报
 * 副露共同封顶——遗漏它会让候选进张相对于*未封顶*的基准比较，可能把实际不
 * 降向听的牌种也报告出来（副露越多，这个偏差越明显）。默认 0 保持对已有调用
 * 方（纯手牌、无副露场景）行为不变。
 *
 * 这里要为同一手牌反复试探 30 余种候选进张，每种候选只比原手牌多一张牌。
 * 标准 `TileSet` 走查表快路径：counts 只数一次，标准型用
 * `createShantenProber`（前缀状态/后缀转移预计算，每个候选只重算改动花色
 * 那一段 DP），七对用 counts 增量公式 O(1) 修正——不为每个候选拷贝手牌
 * 数组、不重复反查牌种、不重跑全部 4 个花色。非标准 `TileSet` 走递归回退：
 * 候选间的递归子状态高度重叠，共享同一个 memo 把重复搜索省下来（memo 只
 * 影响缓存命中，不影响结果）。
 */
const evaluateUkeireInternal = (
  tiles: readonly TileId[],
  options: ShantenOptions,
  tileSet: TileSet = STANDARD_TILE_SET,
  existingMelds = 0,
): UkeireEvaluation => {
  const counts = countsOf(tiles, tileSet);
  if (tileSet === STANDARD_TILE_SET) {
    const standardCurrent = computeShantenFromCounts(counts, existingMelds);
    // 七对基线只算一次；加一张第 k 种牌后 pairs/kinds 的变化只取决于
    // counts[k] 原值（0→新增一种，1→新增一对），可 O(1) 修正。sevenPairs 不与
    // 副露共存（调用方约定，见 shantenWithExposedMelds 的文档），这里不重复
    // 校验 existingMelds。
    let pairs = 0;
    let kindsHeld = 0;
    for (const count of counts) {
      if (count >= 2) pairs += 1;
      if (count > 0) kindsHeld += 1;
    }
    const current = options.sevenPairs
      ? Math.min(standardCurrent, 6 - pairs + Math.max(0, 7 - kindsHeld))
      : standardCurrent;
    const probe = createShantenProber(counts, existingMelds);
    const improvingKinds = tileSet.kinds.filter((kind, index) => {
      const held = counts[index] ?? 0;
      if (held >= tileSet.copiesPerKind) return false;
      let candidate = probe(index);
      if (options.sevenPairs) {
        const sevenPairsCandidate =
          6 - (pairs + (held === 1 ? 1 : 0)) + Math.max(0, 7 - (kindsHeld + (held === 0 ? 1 : 0)));
        if (sevenPairsCandidate < candidate) candidate = sevenPairsCandidate;
      }
      return candidate < current;
    });
    return { shanten: current, improvingKinds };
  }
  const memo = new Map<string, number>();
  const current = computeShanten(tiles, options, tileSet, memo, existingMelds);
  const improvingKinds = tileSet.kinds.filter((kind, index) => {
    if ((counts[index] ?? 0) >= tileSet.copiesPerKind) return false;
    const candidate = (index * tileSet.copiesPerKind) as TileId;
    return computeShanten([...tiles, candidate], options, tileSet, memo, existingMelds) < current;
  });
  return { shanten: current, improvingKinds };
};

export const ukeire = (
  tiles: readonly TileId[],
  options: ShantenOptions,
  tileSet: TileSet = STANDARD_TILE_SET,
  existingMelds = 0,
): TileKind[] => [...evaluateUkeireInternal(tiles, options, tileSet, existingMelds).improvingKinds];

const tileCountsKey = (tiles: readonly TileId[], tileSet: TileSet): string => {
  const counts = countsOf(tiles, tileSet);
  return counts.join("");
};

/**
 * 一次返回向听数和进张，避免调用方先算一次向听、再让 ukeire 再算一遍基线。
 * 结果只读；数组仍由本函数独立生成，调用方可以安全缓存整个结果。
 */
export const evaluateUkeire = (
  tiles: readonly TileId[],
  options: ShantenOptions,
  tileSet: TileSet = STANDARD_TILE_SET,
  existingMelds = 0,
): UkeireEvaluation => evaluateUkeireInternal(tiles, options, tileSet, existingMelds);

/**
 * 批量分析一组手牌。标准牌集合下按 34 种牌的计数去重，避免不同 TileId 排列
 * 或重复叶子手牌重复建表；非标准牌集合也复用相同的去重语义。
 */
export const evaluateUkeireBatch = (
  inputs: readonly UkeireBatchInput[],
  tileSet: TileSet = STANDARD_TILE_SET,
): UkeireEvaluation[] => {
  const cache = new Map<string, UkeireEvaluation>();
  return inputs.map((input) => {
    const existingMelds = input.existingMelds ?? 0;
    const key = `${existingMelds}/${input.options.sevenPairs ? 1 : 0}/${tileCountsKey(input.tiles, tileSet)}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const evaluation = evaluateUkeire(input.tiles, input.options, tileSet, existingMelds);
    cache.set(key, evaluation);
    return evaluation;
  });
};

/**
 * 以同一组 14 张牌为基准，批量返回“弃掉某种牌后”的向听与进张。标准牌集合
 * 使用两次修改 prober：同一花色只重算一段 DP，跨花色时共享基础 prefix/suffix，
 * 避免每个弃牌候选重新建立完整 ukeire prober。
 */
export const evaluateUkeireAfterDiscards = (
  tiles: readonly TileId[],
  discardKindIndexes: readonly number[],
  options: ShantenOptions,
  tileSet: TileSet = STANDARD_TILE_SET,
  existingMelds = 0,
): UkeireAfterDiscardEvaluation[] => {
  if (tileSet !== STANDARD_TILE_SET) {
    return discardKindIndexes.map((discardKindIndex) => {
      const hand = [...tiles];
      const tileIndex = hand.findIndex(
        (tile) => tileSet.kindIndexOf(tileSet.kindOf(tile)) === discardKindIndex,
      );
      if (tileIndex < 0) throw new Error("INVALID_DISCARD_KIND");
      hand.splice(tileIndex, 1);
      const evaluation = evaluateUkeire(hand, options, tileSet, existingMelds);
      return {
        discardKindIndex,
        shanten: evaluation.shanten,
        improvingKinds: evaluation.improvingKinds,
      };
    });
  }

  const counts = countsOf(tiles, tileSet);
  const probe = createTwoChangeShantenProber(counts, existingMelds);
  return discardKindIndexes.map((discardKindIndex) => {
    if ((counts[discardKindIndex] ?? 0) <= 0) throw new Error("INVALID_DISCARD_KIND");
    const leafCounts = [...counts];
    leafCounts[discardKindIndex] = (leafCounts[discardKindIndex] ?? 0) - 1;
    const currentStandard = probe(discardKindIndex);
    const currentSevenPairs = options.sevenPairs
      ? sevenPairsShantenFromCounts(leafCounts)
      : Number.POSITIVE_INFINITY;
    const current = Math.min(currentStandard, currentSevenPairs);
    const improvingKinds: TileKind[] = [];
    for (let addKindIndex = 0; addKindIndex < tileSet.kinds.length; addKindIndex += 1) {
      if ((leafCounts[addKindIndex] ?? 0) >= tileSet.copiesPerKind) continue;
      const standard = probe(discardKindIndex, addKindIndex);
      leafCounts[addKindIndex] = (leafCounts[addKindIndex] ?? 0) + 1;
      const sevenPairs = options.sevenPairs
        ? sevenPairsShantenFromCounts(leafCounts)
        : Number.POSITIVE_INFINITY;
      leafCounts[addKindIndex] = (leafCounts[addKindIndex] ?? 0) - 1;
      if (Math.min(standard, sevenPairs) < current)
        improvingKinds.push(tileSet.kinds[addKindIndex]!);
    }
    return { discardKindIndex, shanten: current, improvingKinds };
  });
};

/**
 * 以同一组手牌为基准，批量返回“先弃一种牌、再加入一种牌”后的结构结果。
 * 只返回向听与进张，不涉及概率、番型、牌墙或任何玩法评分；调用方负责传入
 * 想要试探的弃牌/加入牌种。标准牌集合复用两次修改 prober，避免为每个组合
 * 重建四个花色的 DP。
 */
export const evaluateUkeireAfterDiscardDraws = (
  tiles: readonly TileId[],
  discardKindIndexes: readonly number[],
  drawKindIndexes: readonly number[],
  options: ShantenOptions,
  tileSet: TileSet = STANDARD_TILE_SET,
  existingMelds = 0,
): UkeireAfterDiscardDrawEvaluation[] => {
  if (tileSet !== STANDARD_TILE_SET) {
    return discardKindIndexes.flatMap((discardKindIndex) => {
      const discardTileIndex = tiles.findIndex(
        (tile) => tileSet.kindIndexOf(tileSet.kindOf(tile)) === discardKindIndex,
      );
      if (discardTileIndex < 0) throw new Error("INVALID_DISCARD_KIND");
      const leaf = [...tiles];
      leaf.splice(discardTileIndex, 1);
      return drawKindIndexes.flatMap((drawKindIndex) => {
        const held = leaf.filter(
          (tile) => tileSet.kindIndexOf(tileSet.kindOf(tile)) === drawKindIndex,
        ).length;
        if (held >= tileSet.copiesPerKind) return [];
        const added = (drawKindIndex * tileSet.copiesPerKind) as TileId;
        const evaluation = evaluateUkeire(
          [...leaf, added],
          options,
          tileSet,
          existingMelds,
        );
        return [{ discardKindIndex, drawKindIndex, shanten: evaluation.shanten }];
      });
    });
  }

  const counts = countsOf(tiles, tileSet);
  const probe = createTwoChangeShantenProber(counts, existingMelds);
  return discardKindIndexes.flatMap((discardKindIndex) => {
    if ((counts[discardKindIndex] ?? 0) <= 0) throw new Error("INVALID_DISCARD_KIND");
    const leafCounts = [...counts];
    leafCounts[discardKindIndex] = (leafCounts[discardKindIndex] ?? 0) - 1;
    return drawKindIndexes.flatMap((drawKindIndex) => {
      if ((leafCounts[drawKindIndex] ?? 0) >= tileSet.copiesPerKind) return [];
      const standard = probe(discardKindIndex, drawKindIndex);
      leafCounts[drawKindIndex] = (leafCounts[drawKindIndex] ?? 0) + 1;
      const sevenPairs = options.sevenPairs
        ? sevenPairsShantenFromCounts(leafCounts)
        : Number.POSITIVE_INFINITY;
      leafCounts[drawKindIndex] = (leafCounts[drawKindIndex] ?? 0) - 1;
      return [{ discardKindIndex, drawKindIndex, shanten: Math.min(standard, sevenPairs) }];
    });
  });
};

/**
 * 听牌只描述下一张摸牌能否直接胡，不把普通进张误判为听牌。
 *
 * 等价推导：听牌 ⟺ 当前向听为 0 且存在可摸的进张——任何进张都把向听从 0
 * 降到 -1，而向听 -1 与"直接胡牌"等价（shanten.test.ts 的 property 用例
 * 断言了这条等价性）；ukeire 已经过滤了手里拿满四张、摸不到的牌种，所以
 * 不需要再对每个候选做一次完整的胡牌回溯。
 */
export const isTingpai = (
  tiles: readonly TileId[],
  options: ShantenOptions,
  tileSet: TileSet = STANDARD_TILE_SET,
  existingMelds = 0,
): boolean =>
  computeShanten(tiles, options, tileSet, undefined, existingMelds) === 0 &&
  ukeire(tiles, options, tileSet, existingMelds).length > 0;
