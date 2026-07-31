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
 * lib/win.ts's canFormMelds shape, generalized with a wildcard budget since
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

/** `concealedHand` excludes the not-yet-drawn/claimed winning tile. */
export const isTingpai = (
  concealedHand: readonly TileKind[],
  openMeldsCount: number,
): boolean =>
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
