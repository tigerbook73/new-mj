import type { TileKind } from "../../lib/ids.ts";
import { TILE_KINDS } from "../../lib/tiles.ts";
import { CAISHEN_KIND } from "./constants.ts";

const isCaishen = (kind: TileKind): boolean => kind === CAISHEN_KIND;
const isSuited = (kind: TileKind): boolean =>
  kind.endsWith("m") || kind.endsWith("p") || kind.endsWith("s");
const rankOf = (kind: TileKind): number => Number(kind[0]);

const splitWild = (kinds: readonly TileKind[]): { real: TileKind[]; wild: number } => {
  const real: TileKind[] = [];
  let wild = 0;
  for (const kind of kinds) {
    if (isCaishen(kind)) wild += 1;
    else real.push(kind);
  }
  return { real, wild };
};

const countsOf = (kinds: readonly TileKind[]): number[] => {
  const counts = TILE_KINDS.map(() => 0);
  for (const kind of kinds) {
    const index = TILE_KINDS.indexOf(kind);
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
};

/**
 * Backtracking search over one suit/honor-indexed count array: can the real
 * tiles plus `wild` caishen complete `meldsNeeded` melds (runs/triplets;
 * honors are triplet-only) and one pair (if `needPair`)? Mirrors
 * lib/standard-hand.ts's canFormMelds shape, generalized with a wildcard budget since
 * caishen substitutes for any single tile (docs/variants/hangzhou.md §2).
 */
const canComplete = (
  counts: readonly number[],
  wild: number,
  meldsNeeded: number,
  needPair: boolean,
): boolean => {
  const index = counts.findIndex((count) => count > 0);
  if (index === -1) {
    if (meldsNeeded === 0 && !needPair) return true;
    if (needPair && wild >= 2 && canComplete(counts, wild - 2, meldsNeeded, false)) return true;
    if (meldsNeeded > 0 && wild >= 3 && canComplete(counts, wild - 3, meldsNeeded - 1, needPair))
      return true;
    return false;
  }
  const kind = TILE_KINDS[index] as TileKind;
  const n = counts[index] as number;

  if (needPair) {
    const realUse = Math.min(2, n);
    const wildUse = 2 - realUse;
    if (wildUse <= wild) {
      const next = [...counts];
      next[index] = n - realUse;
      if (canComplete(next, wild - wildUse, meldsNeeded, false)) return true;
    }
  }

  if (meldsNeeded > 0) {
    const realUse = Math.min(3, n);
    const wildUse = 3 - realUse;
    if (wildUse <= wild) {
      const next = [...counts];
      next[index] = n - realUse;
      if (canComplete(next, wild - wildUse, meldsNeeded - 1, needPair)) return true;
    }

    if (isSuited(kind) && rankOf(kind) <= 7) {
      const suit = kind[1];
      const i1 = TILE_KINDS.indexOf(`${rankOf(kind) + 1}${suit}` as TileKind);
      const i2 = TILE_KINDS.indexOf(`${rankOf(kind) + 2}${suit}` as TileKind);
      const n1 = counts[i1] ?? 0;
      const n2 = counts[i2] ?? 0;
      const runWildUse = (n1 > 0 ? 0 : 1) + (n2 > 0 ? 0 : 1);
      if (runWildUse <= wild) {
        const next = [...counts];
        next[index] = n - 1;
        if (n1 > 0) next[i1] = n1 - 1;
        if (n2 > 0) next[i2] = n2 - 1;
        if (canComplete(next, wild - runWildUse, meldsNeeded - 1, needPair)) return true;
      }
    }
  }

  return false;
};

/** 4 melds + 1 pair, caishen may fill any gap. `openMeldsCount` melds are
 * already declared (chi/peng/gang) and excluded from `concealedKinds`. */
export const isStandardWinningHandWithWild = (
  concealedKinds: readonly TileKind[],
  openMeldsCount: number,
): boolean => {
  const meldsNeeded = 4 - openMeldsCount;
  if (meldsNeeded < 0 || concealedKinds.length !== meldsNeeded * 3 + 2) return false;
  const { real, wild } = splitWild(concealedKinds);
  return canComplete(countsOf(real), wild, meldsNeeded, true);
};

// canComplete 的"见证"（拆分）版本：只在胡牌真正宣告的那一刻调用一次，
// 用于揭示实际用到的具体面子/对子组合，供结算展示最终赢牌拆解。
// 绝不会出现在 isTingpai/isWinningHand 的高频路径上（那些只是试探假设的牌型，
// 背后并无实体牌），所以维护第二份独立的回溯实现是可接受的取舍——
// 分支顺序与 canComplete 完全一致，保证探索同一棵决策树。
// 用来补全一组的癞子槽位直接用 CAISHEN_KIND 本身表示，因为替补空缺的癞子
// 本来就是一张实体财神牌摆在那个位置——不需要额外记录"它替代了什么"。
const decomposeComplete = (
  counts: readonly number[],
  wild: number,
  meldsNeeded: number,
  needPair: boolean,
): TileKind[][] | undefined => {
  const index = counts.findIndex((count) => count > 0);
  if (index === -1) {
    if (meldsNeeded === 0 && !needPair) return [];
    if (needPair && wild >= 2) {
      const rest = decomposeComplete(counts, wild - 2, meldsNeeded, false);
      if (rest) return [[CAISHEN_KIND, CAISHEN_KIND], ...rest];
    }
    if (meldsNeeded > 0 && wild >= 3) {
      const rest = decomposeComplete(counts, wild - 3, meldsNeeded - 1, needPair);
      if (rest) return [[CAISHEN_KIND, CAISHEN_KIND, CAISHEN_KIND], ...rest];
    }
    return undefined;
  }
  const kind = TILE_KINDS[index] as TileKind;
  const n = counts[index] as number;

  if (needPair) {
    const realUse = Math.min(2, n);
    const wildUse = 2 - realUse;
    if (wildUse <= wild) {
      const next = [...counts];
      next[index] = n - realUse;
      const rest = decomposeComplete(next, wild - wildUse, meldsNeeded, false);
      if (rest) {
        const group = [
          ...Array<TileKind>(realUse).fill(kind),
          ...Array<TileKind>(wildUse).fill(CAISHEN_KIND),
        ];
        return [group, ...rest];
      }
    }
  }

  if (meldsNeeded > 0) {
    const realUse = Math.min(3, n);
    const wildUse = 3 - realUse;
    if (wildUse <= wild) {
      const next = [...counts];
      next[index] = n - realUse;
      const rest = decomposeComplete(next, wild - wildUse, meldsNeeded - 1, needPair);
      if (rest) {
        const group = [
          ...Array<TileKind>(realUse).fill(kind),
          ...Array<TileKind>(wildUse).fill(CAISHEN_KIND),
        ];
        return [group, ...rest];
      }
    }

    if (isSuited(kind) && rankOf(kind) <= 7) {
      const suit = kind[1];
      const i1 = TILE_KINDS.indexOf(`${rankOf(kind) + 1}${suit}` as TileKind);
      const i2 = TILE_KINDS.indexOf(`${rankOf(kind) + 2}${suit}` as TileKind);
      const n1 = counts[i1] ?? 0;
      const n2 = counts[i2] ?? 0;
      const runWildUse = (n1 > 0 ? 0 : 1) + (n2 > 0 ? 0 : 1);
      if (runWildUse <= wild) {
        const next = [...counts];
        next[index] = n - 1;
        if (n1 > 0) next[i1] = n1 - 1;
        if (n2 > 0) next[i2] = n2 - 1;
        const rest = decomposeComplete(next, wild - runWildUse, meldsNeeded - 1, needPair);
        if (rest) {
          const group: TileKind[] = [
            kind,
            n1 > 0 ? (TILE_KINDS[i1] as TileKind) : CAISHEN_KIND,
            n2 > 0 ? (TILE_KINDS[i2] as TileKind) : CAISHEN_KIND,
          ];
          return [group, ...rest];
        }
      }
    }
  }

  return undefined;
};

/** Witness version of isStandardWinningHandWithWild: the pair + melds actually used, or undefined. */
export const decomposeStandardWinningHandWithWild = (
  concealedKinds: readonly TileKind[],
  openMeldsCount: number,
): TileKind[][] | undefined => {
  const meldsNeeded = 4 - openMeldsCount;
  if (meldsNeeded < 0 || concealedKinds.length !== meldsNeeded * 3 + 2) return undefined;
  const { real, wild } = splitWild(concealedKinds);
  return decomposeComplete(countsOf(real), wild, meldsNeeded, true);
};

export type SevenPairsEvaluation = { valid: boolean; quadCount: number };

/**
 * Seven pairs with caishen filling single-tile gaps. Per docs/variants/hangzhou.md
 * §6, a "deluxe" quad (4 real copies of one kind) must be entirely real —
 * caishen cannot pad a triple up to a quad. A quad counts as **two** of the 7
 * pair-slots (it's worth two pairs, per the confirmed examples), which is why
 * total tile count stays at 14 regardless of quadCount: quadCount real kinds
 * contribute 2 slots each for 4 real tiles, leaving fewer slots that need a
 * plain pair (2 tiles) — the arithmetic below always nets out to 14, and it
 * caps quadCount at 3 (4 quads would need 8 slots), matching the rule table
 * having no "四豪华" tier.
 */
export const evaluateSevenPairsWithWild = (
  concealedKinds: readonly TileKind[],
): SevenPairsEvaluation => {
  const { real, wild } = splitWild(concealedKinds);
  const counts = new Map<TileKind, number>();
  for (const kind of real) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  let slots = 0;
  let wildNeeded = 0;
  let quadCount = 0;
  for (const count of counts.values()) {
    if (count === 1) {
      slots += 1;
      wildNeeded += 1;
    } else if (count === 2) {
      slots += 1;
    } else if (count === 4) {
      slots += 2;
      quadCount += 1;
    } else {
      return { valid: false, quadCount: 0 };
    }
  }
  if (slots > 7) return { valid: false, quadCount: 0 };
  const totalWildNeeded = wildNeeded + (7 - slots) * 2;
  return { valid: totalWildNeeded === wild, quadCount };
};

/** Witness version of evaluateSevenPairsWithWild: reuses it for validity, just materializes
 * the 7 groups (a deluxe quad — 4 real copies of one kind — becomes a single 4-element group). */
export const decomposeSevenPairsWithWild = (
  concealedKinds: readonly TileKind[],
): TileKind[][] | undefined => {
  const evaluation = evaluateSevenPairsWithWild(concealedKinds);
  if (!evaluation.valid) return undefined;
  const { real } = splitWild(concealedKinds);
  const counts = new Map<TileKind, number>();
  for (const kind of real) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  const groups: TileKind[][] = [];
  // A deluxe quad is worth 2 of the 7 pair-slots (see evaluateSevenPairsWithWild's
  // own doc) but is still just one 4-tile group, so slot count and array length
  // diverge — track slots separately to know how many wild-only pairs to pad with.
  let slots = 0;
  for (const [kind, count] of counts) {
    if (count === 4) {
      groups.push([kind, kind, kind, kind]);
      slots += 2;
    } else if (count === 2) {
      groups.push([kind, kind]);
      slots += 1;
    } else {
      groups.push([kind, CAISHEN_KIND]);
      slots += 1;
    }
  }
  while (slots < 7) {
    groups.push([CAISHEN_KIND, CAISHEN_KIND]);
    slots += 1;
  }
  return groups;
};

export type HangzhouHandShape = { family: "basic" } | { family: "sevenPairs"; quadCount: number };

/**
 * `concealedKinds` must be the complete concealed hand including the
 * candidate winning tile (i.e. hand.length + 1). Seven pairs is only tried
 * when fully concealed (no open melds), matching the confirmed 门清 requirement.
 */
export const evaluateWinningShape = (
  concealedKinds: readonly TileKind[],
  openMeldsCount: number,
): HangzhouHandShape | undefined => {
  if (openMeldsCount === 0) {
    const sevenPairs = evaluateSevenPairsWithWild(concealedKinds);
    if (sevenPairs.valid) return { family: "sevenPairs", quadCount: sevenPairs.quadCount };
  }
  if (isStandardWinningHandWithWild(concealedKinds, openMeldsCount)) return { family: "basic" };
  return undefined;
};

export const isWinningHand = (
  concealedKinds: readonly TileKind[],
  openMeldsCount: number,
): boolean => evaluateWinningShape(concealedKinds, openMeldsCount) !== undefined;

/** Witness version of evaluateWinningShape: branch order mirrors it exactly (seven
 * pairs tried first only when concealed) so the family found here always matches
 * the one scoreHangzhouHand actually scored. */
export const decomposeWinningShape = (
  concealedKinds: readonly TileKind[],
  openMeldsCount: number,
): TileKind[][] | undefined => {
  if (openMeldsCount === 0) {
    const sevenPairs = decomposeSevenPairsWithWild(concealedKinds);
    if (sevenPairs) return sevenPairs;
  }
  return decomposeStandardWinningHandWithWild(concealedKinds, openMeldsCount);
};

/** `concealedHand` excludes the not-yet-drawn/claimed winning tile. */
export const isTingpai = (concealedHand: readonly TileKind[], openMeldsCount: number): boolean =>
  TILE_KINDS.some((candidate) => isWinningHand([...concealedHand, candidate], openMeldsCount));

/** docs/variants/hangzhou.md §4: listening, holding caishen, and every
 * possible draw completes the hand. */
export const isBaotou = (concealedHand: readonly TileKind[], openMeldsCount: number): boolean => {
  if (!concealedHand.includes(CAISHEN_KIND)) return false;
  return TILE_KINDS.every((candidate) =>
    isWinningHand([...concealedHand, candidate], openMeldsCount),
  );
};

export { CAISHEN_KIND };
