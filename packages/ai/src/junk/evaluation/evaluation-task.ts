import type { CalibrationEvaluationTaskInput } from "../../evaluation/runner.ts";
import type {
  CalibrationEvaluationResult,
  CalibrationEvaluatorKind,
} from "../../evaluation/types.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";
import { evaluateStructuralMetrics } from "./structural-metrics.ts";
import { evaluateStructuralTwoPlyAll } from "./structural-two-ply.ts";
import { evaluateStructuralBounded } from "./structural-bounded.ts";
import { evaluateStructuralClaimPolicy } from "./structural-claim.ts";
import { evaluateStructuralTurnPolicy } from "./structural-turn.ts";

export type JunkEvaluationTaskInput = CalibrationEvaluationTaskInput<JunkProductionFixtureInput> &
  Readonly<{ evaluator: CalibrationEvaluatorKind }>;

export const evaluateJunkTask = (task: JunkEvaluationTaskInput): CalibrationEvaluationResult => {
  if (task.evaluator === "standard-only")
    return evaluateStructuralMetrics(task.scenarioId, task.input);
  if (task.evaluator === "two-ply-structural-all")
    return evaluateStructuralTwoPlyAll(task.scenarioId, task.input);
  if (task.evaluator === "structural-bounded")
    return evaluateStructuralBounded(task.scenarioId, task.input);
  if (task.evaluator === "structural-claim")
    return evaluateStructuralClaimPolicy(task.scenarioId, task.input);
  if (task.evaluator === "structural-turn")
    return evaluateStructuralTurnPolicy(task.scenarioId, task.input);
  throw new Error(`UNSUPPORTED_BATCH_EVALUATOR: ${task.evaluator}`);
};
