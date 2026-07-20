import type { GameConfig, GameEvent, SeatId } from "@new-mj/core";
import type { SessionFormat, SessionResult } from "@new-mj/protocol";

export type RoomPhase = "waiting" | "in-game" | "finished";
export type RoomStatus = "open" | "closed";

/**
 * Archived per-game event log (phase 4.5's minimal record shape).
 * `seatUserIds` is a snapshot taken at that game's start — `room.players`
 * only reflects *current* occupancy, and a game's own record must stay
 * self-sufficient even if seats change after it ends. No `seed`: replay
 * replays events (rebuildPlayerView), it never re-runs applyAction, so the
 * seed that produced the wall order isn't needed here (fuzz repro is a
 * separate, unrelated use of seed).
 */
export interface FinishedGameLog {
  gameNumber: number;
  seatUserIds: [string | null, string | null, string | null, string | null];
  events: GameEvent[];
  /**
   * Opaque final core state (same shape as `Room.gameState`), captured right
   * before `beginGame()` overwrites it for the next round. 明牌 replay
   * (phase 4.5 step 5) feeds this straight into
   * `getOmniscientView` — cheaper than reconstructing state from `events`
   * (which would need a new "replay to omniscient state" core capability;
   * this sidesteps that by keeping the state snapshot instead). Debug/test-
   * only, same as the live D19 escape hatch — not part of the normal replay
   * (`RoomService.getReplay`) response.
   */
  finalState: unknown;
}

export interface RoomPlayer {
  userId: string;
  seatId: SeatId;
  nickname: string;
  avatar?: string;
  isBot: boolean;
  isReady: boolean;
  isAutoPiloted: boolean;
  isDisconnected: boolean;
  disconnectedAt?: number;
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
  /**
   * True between a game ending (more rounds left in the session) and the
   * next one actually dealing — `ready()` re-checks every seat's `isReady`
   * while this is set and advances once they're all true (see
   * `RoomService.handleGameEnd`/`ready`). Bots/autopiloted seats are
   * auto-confirmed so they never block real players.
   */
  awaitingNextRound: boolean;
  createdAt: number;
  finishedAt?: number;
  result?: SessionResult;
  /** Events for the game currently in progress; archived into `finishedGames` on GameEnded. */
  currentGameEvents: GameEvent[];
  currentGameSeatUserIds: [string | null, string | null, string | null, string | null];
  finishedGames: FinishedGameLog[];
}
