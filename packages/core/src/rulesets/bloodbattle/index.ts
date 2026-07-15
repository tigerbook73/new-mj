import type { RulesetModule } from "@/engine.ts";
import { applyAction, createBloodbattleGame, getLegalActions } from "./state-machine.ts";
import { getPlayerView } from "./view.ts";
import type { BloodbattleAction, BloodbattleState } from "./types.ts";

export { applyChooseLack, applyExchangeThree, createBloodbattlePrelude } from "./prelude.ts";
export { DEFAULT_BLOODBATTLE_CONFIG, parseBloodbattleConfig } from "./config.ts";
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

export const bloodbattleRuleSet: RulesetModule<BloodbattleState, BloodbattleAction> = {
  createGame: createBloodbattleGame,
  applyAction,
  getLegalActions,
  getPlayerView,
};
