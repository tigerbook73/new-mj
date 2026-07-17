import type { RulesetModule } from "@/engine";
import { applyAction, createBloodbattleGame, getLegalActions } from "./state-machine.ts";
import { computeNextBloodbattleDealer } from "./prelude.ts";
import { getPlayerView, rebuildPlayerView } from "./view.ts";
import type { BloodbattleAction, BloodbattlePlayerView, BloodbattleState } from "./types.ts";

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
  rebuildPlayerView,
};
