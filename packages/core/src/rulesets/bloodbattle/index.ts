// Prelude phases only (exchange three / choose lack); the playing phase,
// claim windows and settlement are not implemented, so this ruleset is not
// registered into engine.ts's dispatch table yet (see docs/plan.md 阶段 1.5).
export { applyChooseLack, applyExchangeThree, createBloodbattlePrelude } from "./prelude.ts";
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
} from "./types.ts";
