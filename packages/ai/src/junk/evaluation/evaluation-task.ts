import type { CalibrationEvaluationTaskInput } from "../../evaluation/runner.ts";
import type {
  CalibrationEvaluationResult,
  CalibrationEvaluatorKind,
} from "../../evaluation/types.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";
import { evaluateOnePlyAll, evaluateTwoPlyAll } from "./diagnostic-evaluators.ts";
import { evaluateProductionFixture } from "./production-evaluator.ts";
import { evaluateStructuralMetrics } from "./structural-metrics.ts";

export type JunkEvaluationTaskInput = CalibrationEvaluationTaskInput<JunkProductionFixtureInput> &
  Readonly<{ evaluator: CalibrationEvaluatorKind }>;

export const evaluateJunkTask = (task: JunkEvaluationTaskInput): CalibrationEvaluationResult => {
  if (task.evaluator === "production-weighted")
    return evaluateProductionFixture(task.scenarioId, task.input);
  if (task.evaluator === "one-ply-all") return evaluateOnePlyAll(task.scenarioId, task.input);
  if (task.evaluator === "standard-only")
    return evaluateStructuralMetrics(task.scenarioId, task.input);
  if (task.evaluator === "two-ply-all") return evaluateTwoPlyAll(task.scenarioId, task.input);
  throw new Error(`UNSUPPORTED_BATCH_EVALUATOR: ${task.evaluator}`);
};
