import type { GameEvent, PlayerViewBase, SeatId } from "@new-mj/core";
import type { SessionResult } from "@new-mj/protocol";

export interface PlayerJoinedEvent {
  roomId: string;
  seat: SeatId;
  nickname: string;
  isBot: boolean;
  avatar?: string;
}

export interface ReadyChangedEvent {
  roomId: string;
  seat: SeatId;
  ready: boolean;
}

export interface ScoreUpdatedEvent {
  roomId: string;
  scores: [number, number, number, number];
  gameNumber: number;
  totalGames?: number | undefined;
}

export interface DealerChangedEvent {
  roomId: string;
  dealer: SeatId;
  gameNumber: number;
}

export interface SessionFinishedEvent {
  roomId: string;
  result: SessionResult;
}

export interface PlayerLeftEvent {
  roomId: string;
  seat: SeatId;
}

/** hostLeft: waiting-room host left, room is gone. allPlayersLeft: every seat is now bot/auto-piloted. */
export interface RoomClosedEvent {
  roomId: string;
  reason: "hostLeft" | "allPlayersLeft";
}

/** Unicast per docs/protocol.md §3 — the gateway resolves `seat` to a single socket. */
export interface GameSnapshotEvent {
  roomId: string;
  seat: SeatId;
  view: PlayerViewBase;
  seq: number;
}

/**
 * Unfiltered core event; the gateway applies eventsVisibleTo() per seat
 * before emitting to individual sockets (RoomService does not know about
 * seats/sockets for this one, only the domain event itself).
 */
export interface GameEventBroadcast {
  roomId: string;
  event: GameEvent;
}

export interface RoomEventMap {
  "room:playerJoined": PlayerJoinedEvent;
  "room:readyChanged": ReadyChangedEvent;
  "room:scoreUpdated": ScoreUpdatedEvent;
  "room:dealerChanged": DealerChangedEvent;
  "room:sessionFinished": SessionFinishedEvent;
  "room:playerLeft": PlayerLeftEvent;
  "room:closed": RoomClosedEvent;
  "game:snapshot": GameSnapshotEvent;
  "game:event": GameEventBroadcast;
}
