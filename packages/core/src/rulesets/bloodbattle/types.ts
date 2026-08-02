import type { SeatId, TileId, TileKind } from "../../lib/ids.ts";
import type { Meld, SeatState } from "../../lib/seat-state.ts";
import type { PrngState } from "../../lib/prng.ts";
import type { GameConfig, PlayerViewBase, RuleViolation } from "../../types.ts";
import type { GameEvent } from "../../events.ts";
import { CORE_ERROR_CODES } from "../../errors.ts";
import type { BloodbattleScoringResult } from "./scoring.ts";
import {
  BLOODBATTLE_DRAW_BONUSES,
  BLOODBATTLE_END_REASONS,
  BLOODBATTLE_PHASES,
  BLOODBATTLE_STATUSES,
  BLOODBATTLE_SUITS,
  BLOODBATTLE_WIN_TYPES,
} from "./constants.ts";
import { BLOODBATTLE_EVENT_TYPES as EVENT_TYPES } from "./events.ts";

export type BloodbattlePhase = (typeof BLOODBATTLE_PHASES)[number];

/** bloodbattle 的 applyAction/createGame 能返回给调用方的完整错误码集合；`fail`/config 解析都按这个联合收窄，防止拼写漂移。 */
export type BloodbattleErrorCode =
  | typeof CORE_ERROR_CODES.invalidConfig
  | typeof CORE_ERROR_CODES.unknownAction
  | "ACTION_NOT_AVAILABLE"
  | "ALREADY_SUBMITTED"
  | "CLAIM_NOT_AVAILABLE"
  | "DISCARD_NOT_AVAILABLE"
  | "DRAW_NOT_AVAILABLE"
  | "EXCHANGE_NOT_OPEN"
  | "EXCHANGE_TILES_NOT_SAME_SUIT"
  | "GANG_NOT_AVAILABLE"
  | "HUAZHU_REQUIRES_CAP_FAN"
  | "INVALID_EXCHANGE_TILES"
  | "LACK_NOT_OPEN"
  | "MUST_DISCARD_LACK"
  | "MUST_HU"
  | "SUIT_NOT_HELD"
  | "TILE_NOT_IN_HAND";
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
  | { type: "pass" }
  | { type: "draw" };

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

export type BloodbattlePublicMeld = Omit<Meld, "tiles"> & { tiles: TileKind[] };
export type BloodbattlePublicDiscard = { tile: TileKind; claimedBy?: SeatId };
export type BloodbattlePublicWinSnapshot = Omit<BloodbattleWinSnapshot, "hand" | "winTile"> & {
  hand: TileKind[];
  winTile: TileKind;
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

export type BloodbattlePlayerView = Omit<PlayerViewBase, "seats"> & {
  phase: BloodbattlePhase;
  seats: Array<
    PlayerViewBase["seats"][number] & {
      melds: BloodbattlePublicMeld[];
      discards: BloodbattlePublicDiscard[];
      status: BloodbattleStatus;
      winSnapshot?: BloodbattlePublicWinSnapshot & { melds: BloodbattlePublicMeld[] };
    }
  >;
  scores: [number, number, number, number];
  myLackSuit?: BloodbattleSuit;
  myClaimOptions?: BloodbattleClaimOption[];
  myClaimResponse?: BloodbattleAction;
  lastDiscard?: { seat: SeatId; tile: TileKind };
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
  /** Set while phase is "awaiting-draw"; tells applyDrawAction which event type to emit. */
  pendingDraw?: { seat: SeatId; replacement: boolean };
  gangPayments: BloodbattleGangPayment[];
  lastGangEventId?: number;
  result?: BloodbattleGameResult;
};

export type BloodbattleGameStartedPayload = {
  type: typeof EVENT_TYPES.gameStarted;
  config: BloodbattleConfig;
  dealer: SeatId;
  handCounts: number[];
  wallCount: number;
};

export type BloodbattleHandDealtPayload = {
  type: typeof EVENT_TYPES.handDealt;
  seat: SeatId;
  tiles: TileId[];
};

/** 换三张 prelude, only emitted when config.exchangeThree is set — see prelude.ts. */
export type BloodbattleExchangeThreeSelectedPayload = {
  type: typeof EVENT_TYPES.exchangeThreeSelected;
  tiles: [TileId, TileId, TileId];
};

export type BloodbattleTilesReceivedPayload = {
  type: typeof EVENT_TYPES.tilesReceived;
  tiles: [TileId, TileId, TileId];
};

export type BloodbattleExchangeCompletedPayload = {
  type: typeof EVENT_TYPES.exchangeCompleted;
  direction: number;
};

export type BloodbattleLackChosenPayload = {
  type: typeof EVENT_TYPES.lackChosen;
  suit: BloodbattleSuit;
};

/** Unlike junk/hangzhou, bloodbattle's draw events never carry `tile` — the
 * drawn tile is only ever revealed via the separate TileDrawnPrivate event
 * (same seat-visibility instance regardless of replacement), see
 * state-machine.ts's applyDrawAction. */
export type BloodbattleTileDrawnPayload = {
  type: typeof EVENT_TYPES.tileDrawn | typeof EVENT_TYPES.gangReplacementDrawn;
  seat: SeatId;
};

export type BloodbattleTileDrawnPrivatePayload = {
  type: typeof EVENT_TYPES.tileDrawnPrivate;
  seat: SeatId;
  tile: TileId;
};

/** TileDiscarded 是 public 事件，payload 形状与 junk/hangzhou 一致；
 * TileDiscardedPrivate 是 bloodbattle 自己对同一 {seat,tile} 的座位可见冗余副本，见 applyDiscard。 */
export type BloodbattleTileDiscardedPrivatePayload = {
  type: typeof EVENT_TYPES.tileDiscardedPrivate;
  seat: SeatId;
  tile: TileId;
};

/** Unlike junk/hangzhou (one seat-scoped event per candidate), bloodbattle emits
 * a single PUBLIC ClaimWindowOpened carrying every candidate's options keyed by
 * seat — see applyDiscard/applyBuGang. `source` is only present for a robKong
 * window. */
export type BloodbattleClaimWindowOpenedPayload = {
  type: typeof EVENT_TYPES.claimWindowOpened;
  seat: SeatId;
  tile: TileId;
  options: Partial<Record<SeatId, BloodbattleClaimOption[]>>;
  source?: "robKong";
};

/** Public (unlike junk/hangzhou's seat-only ClaimResponded) — see applyAction. */
export type BloodbattleClaimRespondedPayload = {
  type: typeof EVENT_TYPES.claimResponded;
  seat: SeatId;
  action: BloodbattleAction;
};

/** Only ever the "nobody claimed" shape — a claimed peng/minGang/hu carries its
 * own PengMade/GangMade/HuDeclared event instead, see resolveClaims/drawNext. */
export type BloodbattleClaimWindowResolvedPayload = {
  type: typeof EVENT_TYPES.claimWindowResolved;
  result: "unclaimed";
  seat: SeatId;
};

/** GangMade covers three declaration shapes: anGang/buGang (both public,
 * kind-level `kinds` only — no separate private tile-id reveal, unlike
 * junk/hangzhou) and a claimed minGang (`from` + full `tiles`, see
 * resolveClaims). */
export type BloodbattleGangMadePayload =
  | { type: typeof EVENT_TYPES.gangMade; seat: SeatId; gangType: "anGang"; kinds: TileKind[] }
  | { type: typeof EVENT_TYPES.gangMade; seat: SeatId; gangType: "buGang"; kinds: TileKind[] }
  | {
      type: typeof EVENT_TYPES.gangMade;
      seat: SeatId;
      gangType: "minGang";
      from: SeatId;
      tiles: TileId[];
    };

export type BloodbattlePengMadePayload = {
  type: typeof EVENT_TYPES.pengMade;
  seat: SeatId;
  from: SeatId;
  tile: TileId;
  tiles: TileId[];
};

export type BloodbattleHuDeclaredPayload = {
  type: typeof EVENT_TYPES.huDeclared;
  seat: SeatId;
  winType: BloodbattleWinType;
  // Always present as a key (possibly undefined) — see finishWin — unlike
  // junk/hangzhou's HuDeclared which omits the key entirely for a zimo win.
  from: SeatId | undefined;
  snapshot: {
    hand: TileId[];
    winTile: TileId;
    lack: BloodbattleSuit;
    melds: Meld[];
  };
  scoring: Extract<BloodbattleScoringResult, { hu: true }>;
  activeSeats: SeatId[];
};

export type BloodbattleSettledReason = "gang" | "gangTransfer" | "huaZhu" | "gangRefund" | "daJiao";

export type BloodbattleSettledPayload = {
  type: typeof EVENT_TYPES.settled;
  reason: BloodbattleSettledReason;
  scoreDeltas: [number, number, number, number];
};

export type BloodbattleGameEndedPayload = {
  type: typeof EVENT_TYPES.gameEnded;
  result: BloodbattleGameResult;
};

export type BloodbattleEventPayload =
  | BloodbattleGameStartedPayload
  | BloodbattleHandDealtPayload
  | BloodbattleExchangeThreeSelectedPayload
  | BloodbattleTilesReceivedPayload
  | BloodbattleExchangeCompletedPayload
  | BloodbattleLackChosenPayload
  | { type: typeof EVENT_TYPES.turnStarted; seat: SeatId }
  | BloodbattleTileDrawnPayload
  | BloodbattleTileDrawnPrivatePayload
  | { type: typeof EVENT_TYPES.tileDiscarded; seat: SeatId; tile: TileId }
  | BloodbattleTileDiscardedPrivatePayload
  | BloodbattleClaimWindowOpenedPayload
  | BloodbattleClaimRespondedPayload
  | BloodbattleClaimWindowResolvedPayload
  | BloodbattleGangMadePayload
  | BloodbattlePengMadePayload
  | BloodbattleHuDeclaredPayload
  | BloodbattleSettledPayload
  | BloodbattleGameEndedPayload
  | { type: typeof EVENT_TYPES.wallExhausted };

export type BloodbattleApplyResult =
  | { state: BloodbattleState; events: GameEvent<BloodbattleEventPayload>[] }
  | { error: RuleViolation };
