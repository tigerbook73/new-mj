import { junkRuleSet, rebuildPlayerView } from "../rulesets/junk/index.ts";

// Test-only registry: cross-ruleset invariants (event reconstruction ≡
// direct derivation, etc.) walk this list instead of hardcoding junk.
// bloodbattle isn't added here yet — its playing-phase applyAction/
// getLegalActions/getPlayerView aren't implemented, so it has nothing to walk.
export const REGISTERED_RULESETS_FOR_TESTING = [
  {
    id: "junk",
    createGame: junkRuleSet.createGame,
    applyAction: junkRuleSet.applyAction,
    getLegalActions: junkRuleSet.getLegalActions,
    getPlayerView: junkRuleSet.getPlayerView,
    rebuildPlayerView,
  },
] as const;
