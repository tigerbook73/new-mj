import type { SeatId, TileId } from "../../lib/ids.ts";
import type { SeatState } from "../../lib/seat.ts";
import type { PrngState } from "../../lib/prng.ts";
import type { ApplyResult, GameConfig, PlayerViewBase } from "../../types.ts";

export type BloodbattlePhase =
  "exchanging" | "choosing-lack" | "playing" | "awaiting-claims" | "finished";

export type BloodbattleConfig = GameConfig & {
  rulesetId: "bloodbattle";
  exchangeThree: boolean;
  capFan: number | null;
  multiWinOnDiscard: boolean;
  robKong: boolean;
  checkHuaZhu: boolean;
  checkDaJiao: boolean;
  gangRefund: boolean;
  selfDrawBonus: "addFan" | "addBase";
  mustHuOnLastFour: boolean;
};

export type BloodbattleAction =
  | { type: "exchangeThree"; tiles: [TileId, TileId, TileId] }
  | { type: "chooseLack"; suit: "m" | "p" | "s" }
  | { type: "discard"; tile: TileId }
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
  options: Partial<Record<SeatId, BloodbattleClaimOption[]>>;
  responses: Partial<Record<SeatId, BloodbattleAction>>;
};

export type BloodbattleWinSnapshot = {
  hand: TileId[];
  winTile: TileId;
  lack: "m" | "p" | "s";
};

export type BloodbattleGameResult = {
  winners: SeatId[];
  endReason: "allWin" | "wallExhausted";
};

export type BloodbattlePlayerView = PlayerViewBase & {
  phase: BloodbattlePhase;
  seats: Array<
    PlayerViewBase["seats"][number] & {
      status: "active" | "won";
      winSnapshot?: BloodbattleWinSnapshot & { melds: SeatState["melds"] };
    }
  >;
  scores: [number, number, number, number];
  myLackSuit?: "m" | "p" | "s";
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
  status: ["active" | "won", "active" | "won", "active" | "won", "active" | "won"];
  // Pre-play submissions, one per seat; flattened out of the old
  // variantState namespace (D12 retires variantState entirely).
  exchange?: { selections: Partial<Record<SeatId, [TileId, TileId, TileId]>> };
  lack?: Partial<Record<SeatId, "m" | "p" | "s">>;
  wins?: Partial<Record<SeatId, BloodbattleWinSnapshot>>;
  lastDiscard?: { seat: SeatId; tile: TileId };
  pendingClaims?: BloodbattlePendingClaims;
  result?: BloodbattleGameResult;
};

export type BloodbattleApplyResult = ApplyResult<BloodbattleState>;
