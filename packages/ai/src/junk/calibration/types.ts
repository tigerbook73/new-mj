/** Stable schema version for the structural-calibration manifest and reports. */
export const CALIBRATION_SCHEMA_VERSION = 1 as const;

export type CalibrationHorizon = "early" | "mid" | "late";

export type CalibrationEvaluatorKind =
  | "production-weighted"
  | "full-candidate"
  | "standard-only"
  | "two-ply";

export type CalibrationScenarioSource =
  | Readonly<{ kind: "fixture"; fixtureId: string }>
  | Readonly<{ kind: "snapshot"; snapshotId: string }>
  | Readonly<{ kind: "generated"; seed: number; generatorVersion: string }>
  | Readonly<{ kind: "replay"; replayId: string }>;

/** JSON-safe context shared by fixtures, snapshots and batch scenarios. */
export type CalibrationScenarioInput = Readonly<{
  hand: readonly number[];
  discards: readonly number[];
  melds: readonly Readonly<{ kind: number; tileIds: readonly number[] }>[];
  wallCount: number;
  unseenPoolSize: number;
  horizon: CalibrationHorizon;
}>;

export type CalibrationScenario = Readonly<{
  id: string;
  version: number;
  source: CalibrationScenarioSource;
  seed: number;
}>;

export type NormalizedCalibrationScenario<TInput = CalibrationScenarioInput> = Readonly<{
  scenario: CalibrationScenario;
  input: TInput;
  contentHash: string;
}>;

export type CalibrationManifest = Readonly<{
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  id: string;
  version: number;
  scenarios: readonly CalibrationScenario[];
}>;

export type CalibrationMetricValue = number | string | boolean | null;

export type CalibrationCandidateResult = Readonly<{
  candidateId: string;
  action: unknown;
  metrics: Readonly<Record<string, CalibrationMetricValue>>;
}>;

export type CalibrationEvaluationResult = Readonly<{
  scenarioId: string;
  scenarioContentHash?: string;
  evaluator: CalibrationEvaluatorKind;
  evaluatorVersion: string;
  selectedCandidateId?: string;
  candidates: readonly CalibrationCandidateResult[];
  performance: Readonly<{
    durationMs: number;
    cacheHits: number;
    cacheMisses: number;
  }>;
  status: "ok" | "failed" | "skipped";
  error?: Readonly<{ code: string; message: string }>;
}>;

export type CalibrationRun = Readonly<{
  runId: string;
  gitSha: string;
  command: string;
  configHash: string;
  startedAt: string;
  workerCount: number;
}>;

export type CalibrationReport = Readonly<{
  schemaVersion: typeof CALIBRATION_SCHEMA_VERSION;
  run: CalibrationRun;
  manifest: Pick<CalibrationManifest, "id" | "version">;
  evaluations: readonly CalibrationEvaluationResult[];
}>;
