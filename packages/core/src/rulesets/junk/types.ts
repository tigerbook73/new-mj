import type { SeatId, TileId, TileKind } from "../../lib/ids.ts";
import type { DiscardEntry, Meld, SeatState } from "../../lib/seat.ts";
import type { PrngState } from "../../lib/prng.ts";
import type { GameConfig, PlayerViewBase, RuleViolation } from "../../types.ts";
import {
  EVENT_TYPES,
  type GameEvent,
  type TileDiscardedPayload,
  type TurnStartedPayload,
  type WallExhaustedPayload,
} from "../../events.ts";
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
  /** Legacy fixture compatibility only; v3 always enables seven pairs. */
  sevenPairs?: boolean;
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
      winners: Array<{ seat: SeatId; fanTypes: string[]; multiplier: number; payout: number }>;
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
  dealer?: SeatId;
  lastDiscard?: { seat: SeatId; tile: TileId };
  /** Set right after a draw, cleared once that seat acts (discard/anGang/buGang). */
  justDrawn?: { seat: SeatId; tile: TileId };
  pendingClaims?: JunkPendingClaims;
  /** Set while phase is "awaiting-draw"; tells applyDrawAction where to draw from. */
  pendingDraw?: { seat: SeatId; replacement: boolean };
  seq: number;
  prng: PrngState;
  result?: JunkGameResult;
  gangChain?: [number, number, number, number];
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

export type JunkGameStartedPayload = {
  type: typeof EVENT_TYPES.gameStarted;
  config: JunkConfig;
  dealer: SeatId;
  handCounts: number[];
  wallCount: number;
};

export type JunkHandDealtPayload = {
  type: typeof EVENT_TYPES.handDealt;
  seat: SeatId;
  tiles: TileId[];
};

/** TileDrawn/GangReplacementDrawn are each emitted twice per draw: a public
 * instance with no `tile` (see-that-a-draw-happened) and a seat-visible
 * instance with `tile` (the drawn tile itself) — see emitDraw. */
export type JunkTileDrawnPayload =
  | { type: typeof EVENT_TYPES.tileDrawn | typeof EVENT_TYPES.gangReplacementDrawn; seat: SeatId }
  | {
      type: typeof EVENT_TYPES.tileDrawn | typeof EVENT_TYPES.gangReplacementDrawn;
      seat: SeatId;
      tile: TileId;
    };

export type JunkClaimWindowOpenedPayload = {
  type: typeof EVENT_TYPES.claimWindowOpened;
  options: JunkClaimOption[];
};

export type JunkClaimRespondedPayload = {
  type: typeof EVENT_TYPES.claimResponded;
  action: JunkAction;
};

/** Two distinct outcomes share one event type: a discard that drew no claims
 * at all (`result: "unclaimed"`, see resolveUnclaimed) vs one resolved by a
 * winning claim (see resolveClaimWindow) — the latter carries no `result`
 * field, only the winning `action`'s type. */
export type JunkClaimWindowResolvedPayload =
  | { type: typeof EVENT_TYPES.claimWindowResolved; result: "unclaimed"; seat: SeatId }
  | {
      type: typeof EVENT_TYPES.claimWindowResolved;
      seat: SeatId;
      action: JunkClaimAction["type"];
    };

export type JunkLegalActionsUpdatedPayload = {
  type: typeof EVENT_TYPES.legalActionsUpdated;
  actions: readonly JunkAction[];
};

/** GangMade covers three declaration shapes: anGang (public instance hides
 * `tiles`, seat-visible instance reveals them — see applyAnGang), buGang
 * (always public, always reveals `tiles` — see applyBuGang/resolveUnclaimed),
 * and a claimed minGang (public, carries `from` instead of `gangType` — see
 * claims.ts resolveClaimWindow). */
export type JunkGangMadePayload =
  | { type: typeof EVENT_TYPES.gangMade; seat: SeatId; gangType: "anGang" }
  | { type: typeof EVENT_TYPES.gangMade; seat: SeatId; gangType: "anGang"; tiles: TileId[] }
  | { type: typeof EVENT_TYPES.gangMade; seat: SeatId; gangType: "buGang"; tiles: TileId[] }
  | { type: typeof EVENT_TYPES.gangMade; seat: SeatId; tiles: TileId[]; from: SeatId };

export type JunkChiMadePayload = {
  type: "ChiMade";
  seat: SeatId;
  tiles: TileId[];
  from: SeatId;
};

export type JunkPengMadePayload = {
  type: "PengMade";
  seat: SeatId;
  tiles: TileId[];
  from: SeatId;
};

export type JunkHuDeclaredPayload = {
  type: typeof EVENT_TYPES.huDeclared;
  seat: SeatId;
  winType: "zimo" | "ron";
  hand: TileId[];
  winTile: TileId;
  groups: TileKind[][];
  from?: SeatId;
};

export type JunkSettledPayload = {
  type: typeof EVENT_TYPES.settled;
  scoreDeltas: [number, number, number, number];
};

export type JunkGameEndedPayload = {
  type: typeof EVENT_TYPES.gameEnded;
  result: JunkGameResult;
};

export type JunkEventPayload =
  | JunkGameStartedPayload
  | JunkHandDealtPayload
  | TurnStartedPayload
  | JunkTileDrawnPayload
  | TileDiscardedPayload
  | JunkClaimWindowOpenedPayload
  | JunkClaimRespondedPayload
  | JunkClaimWindowResolvedPayload
  | JunkLegalActionsUpdatedPayload
  | JunkGangMadePayload
  | JunkChiMadePayload
  | JunkPengMadePayload
  | JunkHuDeclaredPayload
  | JunkSettledPayload
  | JunkGameEndedPayload
  | WallExhaustedPayload;

export type JunkApplyResult =
  { state: JunkState; events: GameEvent<JunkEventPayload>[] } | { error: RuleViolation };
