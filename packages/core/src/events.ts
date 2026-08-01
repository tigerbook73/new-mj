import type { SeatId } from "./lib/ids.ts";
import { CORE_ERROR_CODES } from "./errors.ts";

export const EVENT_TYPES = {
  gameStarted: "GameStarted",
  handDealt: "HandDealt",
  turnStarted: "TurnStarted",
  tileDrawn: "TileDrawn",
  tileDrawnPrivate: "TileDrawnPrivate",
  tileDiscarded: "TileDiscarded",
  tileDiscardedPrivate: "TileDiscardedPrivate",
  claimWindowOpened: "ClaimWindowOpened",
  claimResponded: "ClaimResponded",
  claimWindowResolved: "ClaimWindowResolved",
  legalActionsUpdated: "LegalActionsUpdated",
  gangMade: "GangMade",
  gangReplacementDrawn: "GangReplacementDrawn",
  huDeclared: "HuDeclared",
  settled: "Settled",
  gameEnded: "GameEnded",
  wallExhausted: "WallExhausted",
  // bloodbattle-only (换三张/定缺 prelude), no other ruleset emits these.
  exchangeThreeSelected: "ExchangeThreeSelected",
  tilesReceived: "TilesReceived",
  exchangeCompleted: "ExchangeCompleted",
  lackChosen: "LackChosen",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export type EventVisibility = { type: "public" } | { type: "seat"; seats: SeatId[] };

export type GameEvent<TPayload = unknown> = {
  seq: number;
  visibility: EventVisibility;
  payload: TPayload;
};

/**
 * Payload shapes shared verbatim across every ruleset's event stream (junk,
 * hangzhou, bloodbattle) — the handful of events with no ruleset-specific
 * fields. Ruleset-specific events (GameStarted, HuDeclared, GangMade, ...)
 * live in each ruleset's own types.ts since their payload depends on that
 * ruleset's Action/GameResult types.
 */
export type TurnStartedPayload = { type: typeof EVENT_TYPES.turnStarted; seat: SeatId };
export type WallExhaustedPayload = { type: typeof EVENT_TYPES.wallExhausted };
export type TileDiscardedPayload = {
  type: typeof EVENT_TYPES.tileDiscarded;
  seat: SeatId;
  tile: number;
};

export const nextEventSeq = (currentSeq: number): number => {
  if (!Number.isInteger(currentSeq) || currentSeq < 0) {
    throw new Error(CORE_ERROR_CODES.invalidEventSequence);
  }
  return currentSeq + 1;
};

// seq 是状态中已发出的最大序号；非法动作不会调用本函数，也不会消耗序号。
export const createEvent = <TPayload>(
  seq: number,
  visibility: EventVisibility,
  payload: TPayload,
): GameEvent<TPayload> => ({ seq, visibility, payload });

/** Server-facing helper: rules only label visibility; transport only filters it. */
export const eventsVisibleTo = <TPayload>(
  events: readonly GameEvent<TPayload>[],
  seat: number,
): GameEvent<TPayload>[] =>
  events.filter(
    (event) =>
      event.visibility.type === "public" || event.visibility.seats.includes(seat as 0 | 1 | 2 | 3),
  );
