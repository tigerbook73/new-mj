import type { TileKind } from "../../lib/ids.ts";

export type JunkScoringMeld = {
  type: "chi" | "peng" | "anGang" | "minGang" | "buGang";
  tiles: TileKind[];
};

export type JunkScoringInput = {
  /** Which family the winning hand matched, and its concealed decomposition — both
   * already computed by isWin/decomposeJunkWin, which own all shape validation.
   * This function only turns an already-validated win into a fan multiplier, so
   * unlike hangzhou/bloodbattle's scoring functions there is no hu:true/false
   * discriminant to return. */
  family: "standard" | "sevenPairs";
  groups: TileKind[][];
  melds: JunkScoringMeld[];
  win: { by: "zimo" | "ron" };
  /** Winner's own gangChain length at the moment of winning; ignored unless by==="zimo" (junk.md §3). */
  gangChainLength: number;
};

export type JunkScoringResult = { fanTypes: string[]; multiplier: number };

const isTripletGroup = (group: readonly TileKind[]): boolean =>
  group.length === 3 && group[0] === group[1] && group[1] === group[2];

// Only the standard family (4 melds + 1 pair) can be 碰碰胡; sevenPairs is a
// structurally different shape. A single chi meld rules it out immediately;
// otherwise every concealed 3-tile group (the pair is length 2 and skipped)
// must be a triplet — decomposeJunkWin never leaves a kong's 4th tile in
// `groups` (kongs always live in `melds`), so length 3 is the only case to check.
const isPengPengHu = (
  family: "standard" | "sevenPairs",
  groups: readonly TileKind[][],
  melds: readonly JunkScoringMeld[],
): boolean =>
  family === "standard" &&
  !melds.some((meld) => meld.type === "chi") &&
  groups.filter((group) => group.length === 3).every(isTripletGroup);

// anGang is a concealed kong, so it doesn't break 门清; any other declared meld does.
const isMenqing = (melds: readonly JunkScoringMeld[]): boolean =>
  melds.every((meld) => meld.type === "anGang");

/**
 * Scores a completed junk hand per docs/variants/junk.md §3. All six fan types
 * stack multiplicatively (the doc's "所有翻倍可以叠加"); the dealer's flat ×2
 * is a separate per-payment rule applied by the caller (settleWins), not part
 * of this hand-only multiplier.
 */
export const scoreJunkHand = (input: JunkScoringInput): JunkScoringResult => {
  const { family, groups, melds, win, gangChainLength } = input;
  const fanTypes: string[] = [];
  let multiplier = 1;

  if (family === "sevenPairs") {
    fanTypes.push("qidui");
    multiplier *= 2;
  }
  if (isPengPengHu(family, groups, melds)) {
    fanTypes.push("pengpenghu");
    multiplier *= 2;
  }
  if (isMenqing(melds)) {
    fanTypes.push("menqing");
    multiplier *= 2;
  }

  const allTiles = [...groups.flat(), ...melds.flatMap((meld) => meld.tiles)];
  const hasHonor = allTiles.some((kind) => kind.endsWith("z"));
  const suits = new Set(allTiles.filter((kind) => !kind.endsWith("z")).map((kind) => kind[1]));
  if (!hasHonor && suits.size === 1) {
    fanTypes.push("qingyise");
    multiplier *= 4;
  } else if (hasHonor && suits.size === 1) {
    fanTypes.push("hunyise");
    multiplier *= 2;
  }

  const gangChain = win.by === "zimo" ? gangChainLength : 0;
  if (gangChain > 0) {
    fanTypes.push("gangkai");
    multiplier *= 2 ** gangChain;
  }

  return { fanTypes, multiplier };
};
