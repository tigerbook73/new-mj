import discardProduction from "./fixtures/baselines/discard-001-production-v1.baseline.json" with { type: "json" };
import discardOnePly from "./fixtures/baselines/discard-001-one-ply-all-v1.baseline.json" with { type: "json" };
import discardTwoPly from "./fixtures/baselines/discard-001-two-ply-all-v1.baseline.json" with { type: "json" };
import snapshotProduction from "./fixtures/baselines/discard-snapshot-001-production-v1.baseline.json" with { type: "json" };
import snapshotOnePly from "./fixtures/baselines/discard-snapshot-001-one-ply-all-v1.baseline.json" with { type: "json" };
import snapshotTwoPly from "./fixtures/baselines/discard-snapshot-001-two-ply-all-v1.baseline.json" with { type: "json" };
import type { CalibrationBaseline } from "../../evaluation/comparator.ts";

export const JUNK_EVALUATION_BASELINES: readonly CalibrationBaseline[] = [
  discardProduction,
  discardOnePly,
  discardTwoPly,
  snapshotProduction,
  snapshotOnePly,
  snapshotTwoPly,
] as CalibrationBaseline[];
