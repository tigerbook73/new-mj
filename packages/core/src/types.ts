import type { SeatId, TileId } from "./lib/ids.ts";
import type { GameEvent } from "./events.ts";

export type GameConfig = {
  rulesetId: string;
  [key: string]: unknown;
};

export type RuleViolation = {
  code: string;
  message?: string;
};

// Common skeleton every ruleset's PlayerView extends; ruleset-specific fields
// (phase, myClaimOptions, win results, ...) live in each ruleset's own types.
export type PlayerViewBase = {
  seat: SeatId;
  hand: TileId[];
  seats: Array<{ handCount: number }>;
  wallCount: number;
  currentSeat: SeatId;
};

export type ApplyResult<TState> = { state: TState; events: GameEvent[] } | { error: RuleViolation };
