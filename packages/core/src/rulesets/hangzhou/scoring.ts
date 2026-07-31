import type { TileKind } from "../../lib/ids.ts";
import { evaluateWinningShape, isBaotou } from "./hand.ts";

export type HangzhouScoringMeld = {
  type: "chi" | "peng" | "anGang" | "minGang" | "buGang";
  tiles: TileKind[];
};

export type HangzhouScoringInput = {
  /** Concealed hand WITHOUT the winning tile. */
  hand: TileKind[];
  melds: HangzhouScoringMeld[];
  win: { tile: TileKind; by: "zimo" | "ron" };
  /** Winner's cumulative caiPiaoCount at the moment of winning, see hangzhou.md §4. */
  caiPiaoCount: number;
  /** >0 only for a zimo whose replacement draw ends the winner's own
   * consecutive-gang chain, see hangzhou.md §6. Never applies to ron. */
  gangChainLength: number;
  baseScore: number;
};

export type HangzhouScoringResult =
  | { hu: true; fanTypes: string[]; multiplier: number; payout: number }
  | { hu: false; reason: string };

// docs/variants/hangzhou.md §6 "基础型组": pinghu/baotou/caipiao ladder.
const BASE_TIER_FAN_TYPES = ["pinghu", "baotou", "caipiao", "shuangCaipiao", "sanCaipiao"] as const;
const BASE_TIER_MULTIPLIERS = [1, 2, 4, 8, 16] as const;
// "七对型组"
const SEVEN_PAIR_FAN_TYPES = [
  "qiduizi",
  "haohuaQiduizi",
  "shuangHaohuaQiduizi",
  "sanHaohuaQiduizi",
] as const;
const SEVEN_PAIR_MULTIPLIERS = [2, 4, 8, 16] as const;
// "杠型组"
const GANG_CHAIN_FAN_TYPES = ["gangkai", "erLianGang", "sanLianGang", "siLianGang"] as const;
const GANG_CHAIN_MULTIPLIERS = [2, 4, 8, 16] as const;

/**
 * Scores a completed hangzhou hand per docs/variants/hangzhou.md §6. The base
 * (pinghu/baotou/caipiao) and seven-pair ladders are mutually exclusive; the
 * gang-chain ladder multiplies on top of whichever base ladder tier applied.
 */
export const scoreHangzhouHand = (input: HangzhouScoringInput): HangzhouScoringResult => {
  const { hand, melds, win, caiPiaoCount, baseScore } = input;
  // Gang-chain tiers only make sense for a zimo completed by the chain's own
  // replacement draw (hangzhou.md §6); enforced here so callers can't misuse it for ron.
  const gangChainLength = win.by === "zimo" ? input.gangChainLength : 0;
  const concealed = [...hand, win.tile];
  const scoringMelds = melds.map((meld) => ({ type: meld.type, tiles: meld.tiles }));
  const shape = evaluateWinningShape(concealed, scoringMelds.length);
  if (!shape) return { hu: false, reason: "NOT_A_WINNING_SHAPE" };

  const fanTypes: string[] = [];
  let multiplier: number;

  if (shape.family === "sevenPairs") {
    const tier = Math.min(shape.quadCount, SEVEN_PAIR_MULTIPLIERS.length - 1);
    fanTypes.push(SEVEN_PAIR_FAN_TYPES[tier] as string);
    multiplier = SEVEN_PAIR_MULTIPLIERS[tier] as number;
  } else {
    const tier =
      caiPiaoCount >= 1
        ? 1 + Math.min(caiPiaoCount, BASE_TIER_MULTIPLIERS.length - 2)
        : isBaotou(hand, scoringMelds.length)
          ? 1
          : 0;
    fanTypes.push(BASE_TIER_FAN_TYPES[tier] as string);
    multiplier = BASE_TIER_MULTIPLIERS[tier] as number;
  }

  if (gangChainLength > 0) {
    const tier = Math.min(gangChainLength, GANG_CHAIN_MULTIPLIERS.length) - 1;
    fanTypes.push(GANG_CHAIN_FAN_TYPES[tier] as string);
    multiplier *= GANG_CHAIN_MULTIPLIERS[tier] as number;
  }

  return { hu: true, fanTypes, multiplier, payout: baseScore * multiplier };
};
