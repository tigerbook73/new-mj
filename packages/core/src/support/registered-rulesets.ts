import { RULESETS } from "../ruleset-registry.ts";
import type { GameEvent } from "../events.ts";
import type { SeatId } from "../lib/ids.ts";
import type { ApplyResult, GameConfig } from "../types.ts";

type RegisteredRuleset = {
  id: string;
  createGame: (seed: number) => ApplyResult<ReplayState>;
  applyAction: (state: ReplayState, seat: SeatId, action: unknown) => ApplyResult<ReplayState>;
  getLegalActions: (state: ReplayState, seat: SeatId) => readonly unknown[];
  getPlayerView: (state: unknown, seat: SeatId) => unknown;
  rebuildPlayerView: (events: readonly GameEvent[], seat: SeatId) => unknown;
  computeNextDealer: (state: ReplayState, currentDealer: SeatId) => SeatId;
};

type ReplayState = { phase: string; currentSeat: SeatId; config: GameConfig };

// Test-only registry, derived from the single runtime RULESETS registry
// (ruleset-registry.ts): cross-ruleset invariants (event reconstruction ≡
// direct derivation, registry id ≡ config.rulesetId, etc.) walk this list
// instead of hardcoding a ruleset. Adding a ruleset to RULESETS is now the
// only edit needed — it enrolls here automatically. Each RulesetModule entry
// is already `any`-typed at the registry boundary, so no per-ruleset casts
// are needed to fit the narrower ReplayState-based shape below.
export const REGISTERED_RULESETS_FOR_TESTING: readonly RegisteredRuleset[] = Object.entries(
  RULESETS,
).map(([id, ruleset]) => ({
  id,
  createGame: (seed: number) => ruleset.createGame(seed, 0) as ApplyResult<ReplayState>,
  applyAction: (state: ReplayState, seat: SeatId, action: unknown) =>
    ruleset.applyAction(state, seat, action) as ApplyResult<ReplayState>,
  getLegalActions: (state: ReplayState, seat: SeatId) => ruleset.getLegalActions(state, seat),
  getPlayerView: (state: unknown, seat: SeatId) => ruleset.getPlayerView(state, seat),
  rebuildPlayerView: (events: readonly GameEvent[], seat: SeatId) =>
    ruleset.rebuildPlayerView(events, seat),
  computeNextDealer: (state: ReplayState, currentDealer: SeatId) =>
    ruleset.computeNextDealer(state, currentDealer),
}));
