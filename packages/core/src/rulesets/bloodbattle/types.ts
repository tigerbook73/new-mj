import type { SeatId, TileId, TileKind } from "@/lib/ids.ts";
import type { SeatState } from "@/lib/seat.ts";
import type { PrngState } from "@/lib/prng.ts";
import type { ApplyResult, GameConfig, PlayerViewBase } from "@/types.ts";
import {
  BLOODBATTLE_DRAW_BONUSES,
  BLOODBATTLE_END_REASONS,
  BLOODBATTLE_PHASES,
  BLOODBATTLE_STATUSES,
  BLOODBATTLE_SUITS,
  BLOODBATTLE_WIN_TYPES,
} from "./constants.ts";

export type BloodbattlePhase = (typeof BLOODBATTLE_PHASES)[number];
export type BloodbattleSuit = (typeof BLOODBATTLE_SUITS)[number];
export type BloodbattleStatus = (typeof BLOODBATTLE_STATUSES)[number];
export type BloodbattleEndReason = (typeof BLOODBATTLE_END_REASONS)[number];
export type BloodbattleWinType = (typeof BLOODBATTLE_WIN_TYPES)[number];
export type BloodbattleDrawBonus = (typeof BLOODBATTLE_DRAW_BONUSES)[number];

export type BloodbattleConfig = GameConfig & {
  rulesetId: "bloodbattle";
  exchangeThree: boolean;
  capFan: number | null;
  multiWinOnDiscard: boolean;
  robKong: boolean;
  checkHuaZhu: boolean;
  checkDaJiao: boolean;
  gangRefund: boolean;
  selfDrawBonus: BloodbattleDrawBonus;
  mustHuOnLastFour: boolean;
};

export type BloodbattleAction =
  | { type: "exchangeThree"; tiles: [TileId, TileId, TileId] }
  | { type: "chooseLack"; suit: BloodbattleSuit }
  | { type: "discard"; tile: TileId }
  | { type: "anGang"; kind: TileKind }
  | { type: "buGang"; tile: TileId }
  | { type: "peng" }
  | { type: "minGang" }
  | { type: "hu" }
  | { type: "zimo" }
  | { type: "pass" };

export type BloodbattleClaimAction = Extract<
  BloodbattleAction,
  { type: "peng" | "minGang" | "hu" }
>;
export type BloodbattleClaimOption = { action: BloodbattleClaimAction };

export type BloodbattlePendingClaims = {
  discard: { seat: SeatId; tile: TileId };
  source?: "discard" | "robKong";
  options: Partial<Record<SeatId, BloodbattleClaimOption[]>>;
  responses: Partial<Record<SeatId, BloodbattleAction>>;
};

export type BloodbattleWinSnapshot = {
  hand: TileId[];
  winTile: TileId;
  lack: BloodbattleSuit;
};

export type BloodbattleGameResult = {
  winners: SeatId[];
  endReason: BloodbattleEndReason;
};

export type BloodbattleGangPayment = {
  gangEventId: number;
  opener: SeatId;
  payer: SeatId;
  amount: number;
  refunded?: boolean;
  transferred?: boolean;
};

export type BloodbattlePlayerView = PlayerViewBase & {
  phase: BloodbattlePhase;
  seats: Array<
    PlayerViewBase["seats"][number] & {
      status: BloodbattleStatus;
      winSnapshot?: BloodbattleWinSnapshot & { melds: SeatState["melds"] };
    }
  >;
  scores: [number, number, number, number];
  myLackSuit?: BloodbattleSuit;
  myClaimOptions?: BloodbattleClaimOption[];
  myClaimResponse?: BloodbattleAction;
  lastDiscard?: { seat: SeatId; tile: TileId };
  result?: BloodbattleGameResult;
};

export type BloodbattleState = {
  config: BloodbattleConfig;
  phase: BloodbattlePhase;
  wall: TileId[];
  seats: SeatState[];
  currentSeat: SeatId;
  seq: number;
  prng: PrngState;
  scores: [number, number, number, number];
  status: [BloodbattleStatus, BloodbattleStatus, BloodbattleStatus, BloodbattleStatus];
  // Pre-play submissions, one per seat; flattened out of the old
  // variantState namespace (D12 retires variantState entirely).
  exchange?: { selections: Partial<Record<SeatId, [TileId, TileId, TileId]>> };
  lack?: Partial<Record<SeatId, BloodbattleSuit>>;
  wins?: Partial<Record<SeatId, BloodbattleWinSnapshot>>;
  lastDiscard?: { seat: SeatId; tile: TileId };
  pendingClaims?: BloodbattlePendingClaims;
  gangPayments: BloodbattleGangPayment[];
  lastGangEventId?: number;
  result?: BloodbattleGameResult;
};

export type BloodbattleApplyResult = ApplyResult<BloodbattleState>;
