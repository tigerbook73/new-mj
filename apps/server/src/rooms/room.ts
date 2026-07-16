import type { GameConfig, SeatId } from "@new-mj/core";
import type { SessionFormat, SessionResult } from "@new-mj/protocol";

export type RoomPhase = "waiting" | "in-game" | "finished";
export type RoomStatus = "open" | "closed";

export interface RoomPlayer {
  userId: string;
  seatId: SeatId;
  nickname: string;
  avatar?: string;
  isBot: boolean;
  isReady: boolean;
  /**
   * Set once this seat's socket disconnects mid-game (session-mechanics.md
   * §8 评审点 H): auto-played for the rest of the session just like a bot
   * seat, never cleared — this MVP has no reconnect-to-resume-control path.
   * Never true for isBot seats (bots have no socket to disconnect).
   */
  isAutoPiloted: boolean;
}

/**
 * Server-internal room state. `gameState` is intentionally opaque (only
 * @new-mj/core knows its shape, D12); `seed`/`lastEventSeq` are current-game
 * bookkeeping that never crosses the wire — see RoomService.snapshot() for
 * the public RoomInfo projection.
 */
export interface Room {
  id: string;
  name: string;
  ownerUserId: string;
  ownerNickname: string;
  rulesetId: string;
  config: GameConfig;
  sessionFormat: SessionFormat;
  phase: RoomPhase;
  status: RoomStatus;
  players: [RoomPlayer | null, RoomPlayer | null, RoomPlayer | null, RoomPlayer | null];
  scores: [number, number, number, number];
  gameNumber: number;
  totalGames?: number | undefined;
  wins?: [number, number, number, number] | undefined;
  dealer: SeatId;
  seed: number;
  lastEventSeq: number;
  gameState?: unknown;
  createdAt: number;
  finishedAt?: number;
  result?: SessionResult;
}
