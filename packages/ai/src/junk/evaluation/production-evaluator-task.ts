import {
  evaluateProductionFixture,
  type ProductionEvaluatorOptions,
} from "./production-evaluator.ts";
import type { JunkProductionFixtureInput } from "./fixture-provider.ts";
import type { CalibrationEvaluationTaskInput } from "../../evaluation/runner.ts";
import type { CalibrationEvaluationResult } from "../../evaluation/types.ts";

export type JunkProductionEvaluationTaskInput =
  CalibrationEvaluationTaskInput<JunkProductionFixtureInput>;

/** Serializable worker entry for the existing production evaluator. */
export const evaluateProductionTask = (
  task: JunkProductionEvaluationTaskInput,
  options?: ProductionEvaluatorOptions,
): CalibrationEvaluationResult => evaluateProductionFixture(task.scenarioId, task.input, options);
