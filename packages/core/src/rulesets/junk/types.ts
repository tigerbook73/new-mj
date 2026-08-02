import type { GangChain } from "../../lib/gang-chain.ts";
import type { SeatId, TileId, TileKind } from "../../lib/ids.ts";
import type { DiscardEntry, Meld, SeatState } from "../../lib/seat-state.ts";
import type { PrngState } from "../../lib/prng.ts";
import type { GameConfig, PlayerViewBase, RuleViolation } from "../../types.ts";
import type { GameEvent } from "../../events.ts";
import { CORE_ERROR_CODES } from "../../errors.ts";
import { JUNK_PHASES } from "./constants.ts";
import { JUNK_EVENT_TYPES as EVENT_TYPES } from "./events.ts";
import type { JunkFanType } from "./scoring.ts";

export type JunkPhase = (typeof JUNK_PHASES)[number];

/** junk 的 applyAction/createGame 能返回给调用方的完整错误码集合；`fail`/config 解析都按这个联合收窄，防止拼写漂移。 */
export type JunkErrorCode =
  | typeof CORE_ERROR_CODES.invalidConfig
  | typeof CORE_ERROR_CODES.unknownAction
  | "CLAIM_NOT_AVAILABLE"
  | "CLAIM_WINDOW_NOT_OPEN"
  | "DRAW_NOT_AVAILABLE"
  | "GANG_NOT_AVAILABLE"
  | "NOT_YOUR_TURN"
  | "TILE_NOT_IN_HAND"
  | "ZIMO_NOT_AVAILABLE";

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
};

export type JunkPendingClaims = {
  discard: { seat: SeatId; tile: TileId };
  source?: "discard" | "robKong";
  options: Partial<Record<SeatId, JunkClaimOption[]>>;
  responses: Partial<Record<SeatId, JunkAction>>;
};

export type JunkWinnerDetail = {
  seat: SeatId;
  fanTypes: JunkFanType[];
  multiplier: number;
  /** 该赢家本次结算实收的总分（含庄家 ×2 后的 scoreDeltas[seat]）。 */
  payout: number;
};

export type JunkGameResult =
  | { type: "draw"; scoreDeltas: [number, number, number, number] }
  | {
      type: "win";
      winner: SeatId;
      winners: SeatId[];
      /** 供快照/重连使用的稳定结算明细；数字 winners 座位列表保持不变，
       * 房间/会话层的既有消费方不受影响。 */
      winnerDetails: JunkWinnerDetail[];
      winType: "zimo" | "ron";
      from?: SeatId;
      scoreDeltas: [number, number, number, number];
    };

/** 胡牌那一刻揭示，仿照血战到底 WinSnapshot/PublicWinSnapshot 的公开-隐藏拆分模式，
 * 用于结算时展示最终赢牌的面子拆解。`groups` 是实际用到的暗牌拆分结果
 * （面子+将牌，或七对的七组）——本身已经是种类级别，不像 `hand`/`winTile`
 * 那样需要区分公开/隐藏两种表示。 */
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
  /** Fixed for the whole game — who dealt this hand; feeds the flat dealer-double
   * payout rule (junk.md §3). Cross-game continuity (who deals the NEXT game) is
   * computeNextJunkDealer's job and isn't tracked by this field. */
  dealer: SeatId;
  /** Per-seat consecutive-gang counter feeding the 杠开 bonus (junk.md §3/§6):
   * anGang/buGang/a claimed minGang each +1, that seat's own discard resets to 0. */
  gangChain: GangChain;
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
  /** Public: this game's dealer seat, fixed for the whole game (junk.md §7). */
  dealer: SeatId;
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
  type: typeof EVENT_TYPES.chiMade;
  seat: SeatId;
  tiles: TileId[];
  from: SeatId;
};

export type JunkPengMadePayload = {
  type: typeof EVENT_TYPES.pengMade;
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
  /** Fan types hit and their combined multiplier (junk.md §3) — excludes the
   * dealer's flat ×2, which only shows up in Settled's scoreDeltas. */
  fanTypes: string[];
  multiplier: number;
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
  | { type: typeof EVENT_TYPES.turnStarted; seat: SeatId }
  | JunkTileDrawnPayload
  | { type: typeof EVENT_TYPES.tileDiscarded; seat: SeatId; tile: TileId }
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
  | { type: typeof EVENT_TYPES.wallExhausted };

export type JunkApplyResult =
  { state: JunkState; events: GameEvent<JunkEventPayload>[] } | { error: RuleViolation };
