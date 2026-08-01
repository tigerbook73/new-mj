import type { GameEvent } from "../../events.ts";
import type { RulesetModule } from "../../engine.ts";
import { applyAction, createBloodbattleGame, getLegalActions } from "./state-machine.ts";
import { computeNextBloodbattleDealer } from "./prelude.ts";
import { getPlayerView, rebuildPlayerView } from "./view.ts";
import type {
  BloodbattleAction,
  BloodbattleEventPayload,
  BloodbattlePlayerView,
  BloodbattleState,
} from "./types.ts";

export {
  applyChooseLack,
  applyExchangeThree,
  computeNextBloodbattleDealer,
  createBloodbattlePrelude,
} from "./prelude.ts";
export { DEFAULT_BLOODBATTLE_CONFIG, parseBloodbattleConfig } from "./config.ts";
export { settleBloodbattleDraw } from "./settlement.ts";
export { fuzzBloodbattleGames, playBloodbattleGame } from "./fuzz.ts";
export {
  scoreBloodbattleHand,
  type BloodbattleScoringContext,
  type BloodbattleScoringInput,
  type BloodbattleScoringResult,
} from "./scoring.ts";
export type {
  BloodbattleAction,
  BloodbattleApplyResult,
  BloodbattleConfig,
  BloodbattlePhase,
  BloodbattleState,
  BloodbattlePlayerView,
} from "./types.ts";

export const bloodbattleRuleSet: RulesetModule<
  BloodbattleState,
  BloodbattleAction,
  BloodbattlePlayerView
> = {
  createGame: createBloodbattleGame,
  computeNextDealer: computeNextBloodbattleDealer,
  applyAction,
  getLegalActions,
  getPlayerView,
  // RulesetModule's boundary type is untyped GameEvent[] since engine.ts dispatches
  // across heterogeneous rulesets; bloodbattle's own payload union is only meaningful
  // once narrowed back to this ruleset, which is what rebuildPlayerView does internally.
  rebuildPlayerView: (events, seat) =>
    rebuildPlayerView(events as GameEvent<BloodbattleEventPayload>[], seat),
};
