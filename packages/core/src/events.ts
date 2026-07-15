import type { SeatId } from "./lib/ids.ts";
import { CORE_ERROR_CODES } from "./errors.ts";

export const EVENT_TYPES = {
  gameStarted: "GameStarted",
  handDealt: "HandDealt",
  turnStarted: "TurnStarted",
  tileDrawn: "TileDrawn",
  tileDrawnPrivate: "TileDrawnPrivate",
  tileDiscarded: "TileDiscarded",
  claimWindowOpened: "ClaimWindowOpened",
  claimResponded: "ClaimResponded",
  claimWindowResolved: "ClaimWindowResolved",
  gangMade: "GangMade",
  gangReplacementDrawn: "GangReplacementDrawn",
  huDeclared: "HuDeclared",
  settled: "Settled",
  gameEnded: "GameEnded",
  wallExhausted: "WallExhausted",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export type EventVisibility = { type: "public" } | { type: "seat"; seats: SeatId[] };

export type GameEvent<TPayload = unknown> = {
  seq: number;
  visibility: EventVisibility;
  payload: TPayload;
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
