import type { GangChain } from "../../lib/gang-chain.ts";
import type { SeatId, TileId, TileKind } from "../../lib/ids.ts";
import type { DiscardEntry, Meld, SeatState } from "../../lib/seat-state.ts";
import type { PrngState } from "../../lib/prng.ts";
import type { GameConfig, PlayerViewBase, RuleViolation } from "../../types.ts";
import type { GameEvent } from "../../events.ts";
import { CORE_ERROR_CODES } from "../../errors.ts";
import { HANGZHOU_MULTI_HU_POLICIES, HANGZHOU_PHASES } from "./constants.ts";
import { HANGZHOU_EVENT_TYPES as EVENT_TYPES } from "./events.ts";

export type HangzhouPhase = (typeof HANGZHOU_PHASES)[number];
export type HangzhouMultiHuPolicy = (typeof HANGZHOU_MULTI_HU_POLICIES)[number];

/** hangzhou 的 applyAction/createGame 能返回给调用方的完整错误码集合；`fail`/config 解析都按这个联合收窄，防止拼写漂移。 */
export type HangzhouErrorCode =
  | typeof CORE_ERROR_CODES.invalidConfig
  | typeof CORE_ERROR_CODES.unknownAction
  | "CLAIM_NOT_AVAILABLE"
  | "CLAIM_WINDOW_NOT_OPEN"
  | "DRAW_NOT_AVAILABLE"
  | "GANG_NOT_AVAILABLE"
  | "NOT_YOUR_TURN"
  | "TILE_NOT_IN_HAND"
  | "ZIMO_NOT_AVAILABLE";

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

/** 胡牌那一刻揭示，仿照血战到底 WinSnapshot/PublicWinSnapshot 的公开-隐藏拆分模式，
 * 用于结算时展示最终赢牌的面子拆解。`groups` 是实际用于算番的暗牌拆分结果
 * （面子+将牌，或七对的七组）——本身已经是种类级别，不像 `hand`/`winTile`
 * 那样需要区分公开/隐藏两种表示。 */
export type HangzhouWinSnapshot = {
  hand: TileId[];
  winTile: TileId;
  groups: TileKind[][];
};

export type HangzhouPublicWinSnapshot = {
  hand: TileKind[];
  winTile: TileKind;
  groups: TileKind[][];
};

export type HangzhouState = {
  config: HangzhouConfig;
  phase: HangzhouPhase;
  wall: TileId[];
  seats: SeatState[];
  currentSeat: SeatId;
  /** Fixed for the whole game — who dealt this hand; feeds the dealerStreak-tiered
   * payout multiplier (hangzhou.md §7). Cross-game continuity (who deals the NEXT
   * game) is computeNextHangzhouDealer's job and isn't tracked by this field. */
  dealer: SeatId;
  lastDiscard?: { seat: SeatId; tile: TileId };
  /** Set right after a draw, cleared once that seat acts (discard/anGang/buGang). */
  justDrawn?: { seat: SeatId; tile: TileId };
  pendingClaims?: HangzhouPendingClaims;
  /** Set while phase is "awaiting-draw"; tells applyDrawAction where to draw from. */
  pendingDraw?: { seat: SeatId; replacement: boolean };
  seq: number;
  prng: PrngState;
  result?: HangzhouGameResult;
  /** Active when any seat discards caishen; restricts other seats for 1 orbit
   * (docs/variants/hangzhou.md §2). Cleared when turn returns to discarder. */
  caishenLockout?: { discarder: SeatId };
  /** Cumulative "discarded caishen while still baotou" successes per seat for
   * this hand, see docs/variants/hangzhou.md §4. Never reset mid-hand. */
  caiPiaoCount: [number, number, number, number];
  /** Length of the current seat's unbroken consecutive-gang chain, see
   * docs/variants/hangzhou.md §6. Reset to 0 on that seat's next discard. */
  gangChain: GangChain;
  /** Set for each winner right when their hu is declared; never cleared mid-hand. */
  wins?: Partial<Record<SeatId, HangzhouWinSnapshot>>;
};

export type HangzhouPlayerView = Omit<PlayerViewBase, "seats"> & {
  seats: Array<{
    melds: Meld[];
    discards: DiscardEntry[];
    handCount: number;
    justDrawn: boolean;
    winSnapshot?: HangzhouPublicWinSnapshot;
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
  /** Public: this game's dealer seat, fixed for the whole game (hangzhou.md §11). */
  dealer: SeatId;
};

export type HangzhouGameStartedPayload = {
  type: typeof EVENT_TYPES.gameStarted;
  config: HangzhouConfig;
  dealer: SeatId;
  handCounts: number[];
  wallCount: number;
};

export type HangzhouHandDealtPayload = {
  type: typeof EVENT_TYPES.handDealt;
  seat: SeatId;
  tiles: TileId[];
};

/** TileDrawn/GangReplacementDrawn are each emitted twice per draw: a public
 * instance with no `tile` and a seat-visible instance with `tile` — see
 * state-machine.ts's emitDraw. */
export type HangzhouTileDrawnPayload =
  | { type: typeof EVENT_TYPES.tileDrawn | typeof EVENT_TYPES.gangReplacementDrawn; seat: SeatId }
  | {
      type: typeof EVENT_TYPES.tileDrawn | typeof EVENT_TYPES.gangReplacementDrawn;
      seat: SeatId;
      tile: TileId;
    };

export type HangzhouClaimWindowOpenedPayload = {
  type: typeof EVENT_TYPES.claimWindowOpened;
  options: HangzhouClaimOption[];
};

export type HangzhouClaimRespondedPayload = {
  type: typeof EVENT_TYPES.claimResponded;
  action: HangzhouAction;
};

/** Two distinct outcomes share one event type: a discard that drew no claims
 * at all (`result: "unclaimed"`, see resolveUnclaimed) vs one resolved by a
 * winning claim (see claims.ts resolveClaimWindow) — the latter carries no
 * `result` field, only the winning `action`'s type. */
export type HangzhouClaimWindowResolvedPayload =
  | { type: typeof EVENT_TYPES.claimWindowResolved; result: "unclaimed"; seat: SeatId }
  | {
      type: typeof EVENT_TYPES.claimWindowResolved;
      seat: SeatId;
      action: HangzhouClaimAction["type"];
    };

export type HangzhouLegalActionsUpdatedPayload = {
  type: typeof EVENT_TYPES.legalActionsUpdated;
  actions: readonly HangzhouAction[];
};

/** GangMade covers three declaration shapes: anGang (public instance hides
 * `tiles`, seat-visible instance reveals them — see applyAnGang), buGang
 * (always public, always reveals `tiles` — see applyBuGang), and a claimed
 * minGang (public, carries `from` instead of `gangType` — see claims.ts
 * resolveClaimWindow). */
export type HangzhouGangMadePayload =
  | { type: typeof EVENT_TYPES.gangMade; seat: SeatId; gangType: "anGang" }
  | { type: typeof EVENT_TYPES.gangMade; seat: SeatId; gangType: "anGang"; tiles: TileId[] }
  | { type: typeof EVENT_TYPES.gangMade; seat: SeatId; gangType: "buGang"; tiles: TileId[] }
  | { type: typeof EVENT_TYPES.gangMade; seat: SeatId; tiles: TileId[]; from: SeatId };

export type HangzhouChiMadePayload = {
  type: typeof EVENT_TYPES.chiMade;
  seat: SeatId;
  tiles: TileId[];
  from: SeatId;
};

export type HangzhouPengMadePayload = {
  type: typeof EVENT_TYPES.pengMade;
  seat: SeatId;
  tiles: TileId[];
  from: SeatId;
};

export type HangzhouHuDeclaredPayload = {
  type: typeof EVENT_TYPES.huDeclared;
  seat: SeatId;
  winType: "zimo" | "ron";
  hand: TileId[];
  winTile: TileId;
  groups: TileKind[][];
  fanTypes: string[];
  multiplier: number;
  from?: SeatId;
};

export type HangzhouSettledPayload = {
  type: typeof EVENT_TYPES.settled;
  scoreDeltas: [number, number, number, number];
};

export type HangzhouGameEndedPayload = {
  type: typeof EVENT_TYPES.gameEnded;
  result: HangzhouGameResult;
};

export type HangzhouEventPayload =
  | HangzhouGameStartedPayload
  | HangzhouHandDealtPayload
  | { type: typeof EVENT_TYPES.turnStarted; seat: SeatId }
  | HangzhouTileDrawnPayload
  | { type: typeof EVENT_TYPES.tileDiscarded; seat: SeatId; tile: TileId }
  | HangzhouClaimWindowOpenedPayload
  | HangzhouClaimRespondedPayload
  | HangzhouClaimWindowResolvedPayload
  | HangzhouLegalActionsUpdatedPayload
  | HangzhouGangMadePayload
  | HangzhouChiMadePayload
  | HangzhouPengMadePayload
  | HangzhouHuDeclaredPayload
  | HangzhouSettledPayload
  | HangzhouGameEndedPayload
  | { type: typeof EVENT_TYPES.wallExhausted };

export type HangzhouApplyResult =
  { state: HangzhouState; events: GameEvent<HangzhouEventPayload>[] } | { error: RuleViolation };
