import { bloodbattleRuleSet } from "@/rulesets/bloodbattle/index";
import { rebuildPlayerView as rebuildBloodbattlePlayerView } from "@/rulesets/bloodbattle/view";
import { junkRuleSet, rebuildPlayerView } from "@/rulesets/junk/index";
import type { GameEvent } from "@/events";
import type { SeatId } from "@/lib/ids";
import type { ApplyResult } from "@/types";

type RegisteredRuleset = {
  id: string;
  createGame: (seed: number) => ApplyResult<ReplayState>;
  applyAction: (state: ReplayState, seat: SeatId, action: unknown) => ApplyResult<ReplayState>;
  getLegalActions: (state: ReplayState, seat: SeatId) => readonly unknown[];
  getPlayerView: (state: unknown, seat: SeatId) => unknown;
  rebuildPlayerView: (events: readonly GameEvent[], seat: SeatId) => unknown;
};

type ReplayState = { phase: string; currentSeat: SeatId };

// Test-only registry: cross-ruleset invariants (event reconstruction ≡
// direct derivation, etc.) walk this list instead of hardcoding a ruleset.
export const REGISTERED_RULESETS_FOR_TESTING: readonly RegisteredRuleset[] = [
  {
    id: "junk",
    createGame: (seed) => junkRuleSet.createGame(seed) as ApplyResult<ReplayState>,
    applyAction: (state, seat, action) =>
      junkRuleSet.applyAction(
        state as Parameters<typeof junkRuleSet.applyAction>[0],
        seat,
        action as never,
      ) as ApplyResult<ReplayState>,
    getLegalActions: (state, seat) =>
      junkRuleSet.getLegalActions(state as Parameters<typeof junkRuleSet.getLegalActions>[0], seat),
    getPlayerView: (state, seat) =>
      junkRuleSet.getPlayerView(state as Parameters<typeof junkRuleSet.getPlayerView>[0], seat),
    rebuildPlayerView,
  },
  {
    id: "bloodbattle",
    createGame: (seed) => bloodbattleRuleSet.createGame(seed) as ApplyResult<ReplayState>,
    applyAction: (state, seat, action) =>
      bloodbattleRuleSet.applyAction(
        state as Parameters<typeof bloodbattleRuleSet.applyAction>[0],
        seat,
        action as never,
      ) as ApplyResult<ReplayState>,
    getLegalActions: (state, seat) =>
      bloodbattleRuleSet.getLegalActions(
        state as Parameters<typeof bloodbattleRuleSet.getLegalActions>[0],
        seat,
      ),
    getPlayerView: (state, seat) =>
      bloodbattleRuleSet.getPlayerView(
        state as Parameters<typeof bloodbattleRuleSet.getPlayerView>[0],
        seat,
      ),
    rebuildPlayerView: rebuildBloodbattlePlayerView,
  },
] as const;
