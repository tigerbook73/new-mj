import type { SeatId, TileId, TileKind } from "@/lib/ids";
import type { DiscardEntry, Meld, SeatState } from "@/lib/seat";
import type { PrngState } from "@/lib/prng";
import type { ApplyResult, GameConfig, PlayerViewBase } from "@/types";
import { JUNK_MULTI_HU_POLICIES, JUNK_PHASES } from "./constants.ts";

export type JunkPhase = (typeof JUNK_PHASES)[number];
export type JunkMultiHuPolicy = (typeof JUNK_MULTI_HU_POLICIES)[number];

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
  multiHuPolicy: JunkMultiHuPolicy;
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

export type JunkPlayerView = Omit<PlayerViewBase, "seats"> & {
  seats: Array<{
    melds: Meld[];
    discards: DiscardEntry[];
    handCount: number;
  }>;
  phase: JunkPhase;
  myClaimOptions?: JunkClaimOption[];
  myClaimResponse?: JunkAction;
  lastDiscard?: { seat: SeatId; tile: TileId };
  result?: JunkGameResult;
};

export type JunkApplyResult = ApplyResult<JunkState>;
