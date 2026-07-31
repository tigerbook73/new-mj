import type { SeatId, TileId, TileKind } from "../../lib/ids.ts";
import type { DiscardEntry, Meld, SeatState } from "../../lib/seat.ts";
import type { PrngState } from "../../lib/prng.ts";
import type { ApplyResult, GameConfig, PlayerViewBase } from "../../types.ts";
import { HANGZHOU_MULTI_HU_POLICIES, HANGZHOU_PHASES } from "./constants.ts";

export type HangzhouPhase = (typeof HANGZHOU_PHASES)[number];
export type HangzhouMultiHuPolicy = (typeof HANGZHOU_MULTI_HU_POLICIES)[number];

export type HangzhouAction =
  | { type: "discard"; tile: TileId }
  | { type: "anGang"; kind: TileKind }
  | { type: "buGang"; tile: TileId }
  | { type: "zimo" }
  | { type: "chi"; tiles: [TileId, TileId] }
  | { type: "peng" }
  | { type: "minGang" }
  | { type: "hu" }
  | { type: "pass" }
  | { type: "draw" };

export type HangzhouClaimAction = Extract<
  HangzhouAction,
  { type: "chi" | "peng" | "minGang" | "hu" }
>;

export type HangzhouClaimOption = {
  action: HangzhouClaimAction;
};

export type HangzhouConfig = GameConfig & {
  rulesetId: "hangzhou";
  multiHuPolicy: HangzhouMultiHuPolicy;
  baseScore: number;
  /** Consecutive terms the current dealer has held, including this game (see
   * hangzhou.md §5/§8). Session-computed by the generic room layer, not a
   * user-facing config knob; other rulesets ignore this field. */
  dealerStreak: number;
};

export type HangzhouPendingClaims = {
  discard: { seat: SeatId; tile: TileId };
  options: Partial<Record<SeatId, HangzhouClaimOption[]>>;
  responses: Partial<Record<SeatId, HangzhouAction>>;
};

/** One winner's fan breakdown from a single hu, see docs/variants/hangzhou.md §6. */
export type HangzhouWinDetail = {
  seat: SeatId;
  fanTypes: string[];
  multiplier: number;
  payout: number;
};

export type HangzhouGameResult =
  | { type: "draw"; scoreDeltas: [number, number, number, number] }
  | {
      type: "win";
      winner: SeatId;
      winners: HangzhouWinDetail[];
      winType: "zimo" | "ron";
      from?: SeatId;
      scoreDeltas: [number, number, number, number];
    };

export type HangzhouState = {
  config: HangzhouConfig;
  phase: HangzhouPhase;
  wall: TileId[];
  seats: SeatState[];
  currentSeat: SeatId;
  lastDiscard?: { seat: SeatId; tile: TileId };
  /** Set right after a draw, cleared once that seat acts (discard/anGang/buGang). */
  justDrawn?: { seat: SeatId; tile: TileId };
  pendingClaims?: HangzhouPendingClaims;
  /** Set while phase is "awaiting-draw"; tells applyDrawAction where to draw from. */
  pendingDraw?: { seat: SeatId; replacement: boolean };
  seq: number;
  prng: PrngState;
  result?: HangzhouGameResult;
  /** Cumulative "discarded caishen while still baotou" successes per seat for
   * this hand, see docs/variants/hangzhou.md §4. Never reset mid-hand. */
  caiPiaoCount: [number, number, number, number];
  /** Length of the current seat's unbroken consecutive-gang chain, see
   * docs/variants/hangzhou.md §6. Reset to 0 on that seat's next discard. */
  gangChain: [number, number, number, number];
};

export type HangzhouPlayerView = Omit<PlayerViewBase, "seats"> & {
  seats: Array<{
    melds: Meld[];
    discards: DiscardEntry[];
    handCount: number;
    justDrawn: boolean;
  }>;
  phase: HangzhouPhase;
  myClaimOptions?: HangzhouClaimOption[];
  myClaimResponse?: HangzhouAction;
  myActionOptions?: HangzhouAction[];
  lastDiscard?: { seat: SeatId; tile: TileId };
  justDrawn?: TileId;
  result?: HangzhouGameResult;
  /** Derived, private, recomputed after every transition — see hangzhou.md §4/§11. */
  isTingpai: boolean;
  isBaotou: boolean;
  isCaipiao: boolean;
  /** Public: whether ron is currently allowed (dealerStreak >= 3), see
   * hangzhou.md §5/§11 — santiao is table-wide, not a per-seat secret. */
  dealerStreak: number;
};

export type HangzhouApplyResult = ApplyResult<HangzhouState>;
