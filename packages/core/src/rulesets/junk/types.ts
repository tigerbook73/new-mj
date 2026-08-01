import type { SeatId, TileId, TileKind } from "../../lib/ids.ts";
import type { DiscardEntry, Meld, SeatState } from "../../lib/seat.ts";
import type { PrngState } from "../../lib/prng.ts";
import type { ApplyResult, GameConfig, PlayerViewBase } from "../../types.ts";
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
  | { type: "pass" }
  | { type: "draw" };

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

/** Revealed at the moment of a hu, mirrors bloodbattle's WinSnapshot/PublicWinSnapshot
 * split (see docs/process/plan.md 胡牌结算展示最终赢牌组合). `groups` is the concealed
 * decomposition actually used (melds+pair, or seven pair-groups) — already kind-level
 * so it needs no public/private conversion, unlike `hand`/`winTile`. */
export type JunkWinSnapshot = {
  hand: TileId[];
  winTile: TileId;
  groups: TileKind[][];
};

export type JunkPublicWinSnapshot = {
  hand: TileKind[];
  winTile: TileKind;
  groups: TileKind[][];
};

export type JunkState = {
  config: JunkConfig;
  phase: JunkPhase;
  wall: TileId[];
  seats: SeatState[];
  currentSeat: SeatId;
  lastDiscard?: { seat: SeatId; tile: TileId };
  /** Set right after a draw, cleared once that seat acts (discard/anGang/buGang). */
  justDrawn?: { seat: SeatId; tile: TileId };
  pendingClaims?: JunkPendingClaims;
  /** Set while phase is "awaiting-draw"; tells applyDrawAction where to draw from. */
  pendingDraw?: { seat: SeatId; replacement: boolean };
  seq: number;
  prng: PrngState;
  result?: JunkGameResult;
  /** Set for each winner right when their hu is declared; never cleared mid-hand. */
  wins?: Partial<Record<SeatId, JunkWinSnapshot>>;
};

export type JunkPlayerView = Omit<PlayerViewBase, "seats"> & {
  seats: Array<{
    melds: Meld[];
    discards: DiscardEntry[];
    handCount: number;
    /** Public: whether this seat just drew and hasn't acted yet — the fact is public (see the unrevealed public TileDrawn event), only the tile identity is private. */
    justDrawn: boolean;
    winSnapshot?: JunkPublicWinSnapshot;
  }>;
  phase: JunkPhase;
  myClaimOptions?: JunkClaimOption[];
  myClaimResponse?: JunkAction;
  /** Complete server-computed actions for this seat; pass is included during claims. */
  myActionOptions?: JunkAction[];
  lastDiscard?: { seat: SeatId; tile: TileId };
  /** Private: only present when the requesting seat is the one that just drew. */
  justDrawn?: TileId;
  result?: JunkGameResult;
};

export type JunkApplyResult = ApplyResult<JunkState>;
