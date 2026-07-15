import type { SeatId, TileId, TileKind } from "@/lib/ids.ts";
import type { SeatState } from "@/lib/seat.ts";
import type { PrngState } from "@/lib/prng.ts";
import type { ApplyResult, GameConfig, PlayerViewBase } from "@/types.ts";

export type JunkPhase = "dealing" | "playing" | "awaiting-claims" | "finished";

export type JunkAction =
  | { type: "discard"; tile: TileId }
  | { type: "anGang"; kind: TileKind }
  | { type: "buGang"; tile: TileId }
  | { type: "zimo" }
  | { type: "chi"; tiles: [TileId, TileId] }
  | { type: "peng" }
  | { type: "minGang" }
  | { type: "hu" }
  | { type: "pass" };

export type JunkClaimAction = Extract<JunkAction, { type: "chi" | "peng" | "minGang" | "hu" }>;

export type JunkClaimOption = {
  action: JunkClaimAction;
};

export type JunkConfig = GameConfig & {
  rulesetId: "junk";
  sevenPairs: boolean;
  robKong: boolean;
  multiHuPolicy: "headJump" | "all";
};

export type JunkPendingClaims = {
  discard: { seat: SeatId; tile: TileId };
  source?: "discard" | "robKong";
  options: Partial<Record<SeatId, JunkClaimOption[]>>;
  responses: Partial<Record<SeatId, JunkAction>>;
};

export type JunkGameResult =
  | { type: "draw"; scoreDeltas: [number, number, number, number] }
  | {
      type: "win";
      winner: SeatId;
      winners: SeatId[];
      winType: "zimo" | "ron";
      from?: SeatId;
      scoreDeltas: [number, number, number, number];
    };

export type JunkState = {
  config: JunkConfig;
  phase: JunkPhase;
  wall: TileId[];
  seats: SeatState[];
  currentSeat: SeatId;
  lastDiscard?: { seat: SeatId; tile: TileId };
  pendingClaims?: JunkPendingClaims;
  seq: number;
  prng: PrngState;
  result?: JunkGameResult;
};

export type JunkPlayerView = PlayerViewBase & {
  phase: JunkPhase;
  myClaimOptions?: JunkClaimOption[];
  myClaimResponse?: JunkAction;
  lastDiscard?: { seat: SeatId; tile: TileId };
  result?: JunkGameResult;
};

export type JunkApplyResult = ApplyResult<JunkState>;
