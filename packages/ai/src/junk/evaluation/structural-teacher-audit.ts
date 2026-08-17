import {
  evaluateStructuralDiscard,
  type StructuralDiscardCandidate,
} from "../structural-discard.ts";
import { contentHashOf } from "./hash.ts";
import { generateJunkSamples, normalizeGeneratedJunkSample } from "./generated-samples.ts";

const MINIMUM_AGREEMENT_RATE = 0.99;
const MAXIMUM_P95_RATIO = 0.6;

type LatencySummary = Readonly<{ p50Ms: number; p95Ms: number }>;

export type StructuralTeacherMismatch = Readonly<{
  scenarioSeed: number;
  boundedCandidateId: string;
  teacherCandidateId: string;
  teacherMinusBoundedImmediateCompletionMass: number;
  boundedMinusTeacherExpectedShanten: number;
  teacherMinusBoundedExpectedKinds: number;
  teacherMinusBoundedExpectedTiles: number;
}>;

export type StructuralTeacherAuditSplit = Readonly<{
  seed: number;
  scenarioCount: number;
  agreementCount: number;
  agreementRate: number;
  mismatchCount: number;
  mismatches: readonly StructuralTeacherMismatch[];
  averageBoundedSearchedCandidateCount: number;
  boundedLatency: LatencySummary;
  fullLatency: LatencySummary;
  p95Ratio: number;
}>;

export type StructuralTeacherAudit = Readonly<{
  protocolVersion: "bounded-structural-teacher-v1";
  generatorVersion: "standard-concealed-v1";
  thresholds: Readonly<{
    minimumAgreementRate: typeof MINIMUM_AGREEMENT_RATE;
    maximumP95Ratio: typeof MAXIMUM_P95_RATIO;
  }>;
  development: StructuralTeacherAuditSplit;
  heldOut: StructuralTeacherAuditSplit;
  splitDisjoint: true;
  acceptance: Readonly<{
    developmentAgreementPassed: boolean;
    heldOutAgreementPassed: boolean;
    developmentPerformancePassed: boolean;
    heldOutPerformancePassed: boolean;
  }>;
  accepted: boolean;
}>;

type AuditOptions = Readonly<{ developmentSeed: number; heldOutSeed: number; count: number }>;

const scenarioSeed = (source: { kind: string; seed?: number }): number => {
  if (source.kind !== "generated" || source.seed === undefined) throw new Error("INVALID_SOURCE");
  return source.seed;
};

const quantile = (values: readonly number[], proportion: number): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * proportion) - 1)] ?? 0;
};

const selectedCandidate = (
  candidates: readonly StructuralDiscardCandidate[],
  candidateId: string,
): StructuralDiscardCandidate => {
  const candidate = candidates.find(({ action }) => JSON.stringify(action) === candidateId);
  if (!candidate) throw new Error("SELECTED_STRUCTURAL_CANDIDATE_MISSING");
  return candidate;
};

const value = (input: number | null): number => input ?? 0;

const evaluateSplit = (seed: number, count: number): StructuralTeacherAuditSplit => {
  const samples = generateJunkSamples({ seed, count }).samples;
  const mismatches: StructuralTeacherMismatch[] = [];
  const boundedDurations: number[] = [];
  const fullDurations: number[] = [];
  let searchedCandidateTotal = 0;

  for (const sample of samples) {
    const { input } = normalizeGeneratedJunkSample(sample.scenario, sample.data);
    let startedAt = performance.now();
    const bounded = evaluateStructuralDiscard(input.view, input.legalActions);
    boundedDurations.push(performance.now() - startedAt);
    startedAt = performance.now();
    const full = evaluateStructuralDiscard(input.view, input.legalActions, {
      maxFirstCandidates: Number.POSITIVE_INFINITY,
      applyDominanceGuardrail: false,
    });
    fullDurations.push(performance.now() - startedAt);
    searchedCandidateTotal += bounded.searchedCandidateCount;
    if (!bounded.action || !full.action) throw new Error("STRUCTURAL_AUDIT_SELECTION_MISSING");
    const boundedId = JSON.stringify(bounded.action);
    const teacherId = JSON.stringify(full.action);
    if (boundedId === teacherId) continue;
    const boundedMetrics = selectedCandidate(full.candidates, boundedId);
    const teacherMetrics = selectedCandidate(full.candidates, teacherId);
    mismatches.push({
      scenarioSeed: scenarioSeed(sample.scenario.source),
      boundedCandidateId: boundedId,
      teacherCandidateId: teacherId,
      teacherMinusBoundedImmediateCompletionMass:
        value(teacherMetrics.immediateCompletionMass) -
        value(boundedMetrics.immediateCompletionMass),
      boundedMinusTeacherExpectedShanten:
        value(boundedMetrics.conditionalExpectedBestShanten) -
        value(teacherMetrics.conditionalExpectedBestShanten),
      teacherMinusBoundedExpectedKinds:
        value(teacherMetrics.conditionalExpectedBestLiveImprovingKindCount) -
        value(boundedMetrics.conditionalExpectedBestLiveImprovingKindCount),
      teacherMinusBoundedExpectedTiles:
        value(teacherMetrics.conditionalExpectedBestLiveImprovingTileCount) -
        value(boundedMetrics.conditionalExpectedBestLiveImprovingTileCount),
    });
  }

  const boundedLatency = {
    p50Ms: quantile(boundedDurations, 0.5),
    p95Ms: quantile(boundedDurations, 0.95),
  };
  const fullLatency = {
    p50Ms: quantile(fullDurations, 0.5),
    p95Ms: quantile(fullDurations, 0.95),
  };
  return {
    seed,
    scenarioCount: samples.length,
    agreementCount: samples.length - mismatches.length,
    agreementRate: (samples.length - mismatches.length) / samples.length,
    mismatchCount: mismatches.length,
    mismatches,
    averageBoundedSearchedCandidateCount: searchedCandidateTotal / samples.length,
    boundedLatency,
    fullLatency,
    p95Ratio: boundedLatency.p95Ms / fullLatency.p95Ms,
  };
};

export const auditStructuralTeacher = ({
  developmentSeed,
  heldOutSeed,
  count,
}: AuditOptions): StructuralTeacherAudit => {
  if (developmentSeed === heldOutSeed) throw new Error("OVERLAPPING_AUDIT_SEEDS");
  const developmentSamples = generateJunkSamples({ seed: developmentSeed, count });
  const heldOutSamples = generateJunkSamples({ seed: heldOutSeed, count });
  const developmentKeys = new Set(
    developmentSamples.samples.flatMap(({ scenario, data }) => [
      `seed:${scenarioSeed(scenario.source)}`,
      `content:${contentHashOf(data)}`,
    ]),
  );
  if (
    heldOutSamples.samples.some(({ scenario, data }) =>
      [`seed:${scenarioSeed(scenario.source)}`, `content:${contentHashOf(data)}`].some((key) =>
        developmentKeys.has(key),
      ),
    )
  ) {
    throw new Error("OVERLAPPING_AUDIT_SPLITS");
  }

  const development = evaluateSplit(developmentSeed, count);
  const heldOut = evaluateSplit(heldOutSeed, count);
  const acceptance = {
    developmentAgreementPassed: development.agreementRate >= MINIMUM_AGREEMENT_RATE,
    heldOutAgreementPassed: heldOut.agreementRate >= MINIMUM_AGREEMENT_RATE,
    developmentPerformancePassed: development.p95Ratio <= MAXIMUM_P95_RATIO,
    heldOutPerformancePassed: heldOut.p95Ratio <= MAXIMUM_P95_RATIO,
  };
  return {
    protocolVersion: "bounded-structural-teacher-v1",
    generatorVersion: "standard-concealed-v1",
    thresholds: {
      minimumAgreementRate: MINIMUM_AGREEMENT_RATE,
      maximumP95Ratio: MAXIMUM_P95_RATIO,
    },
    development,
    heldOut,
    splitDisjoint: true,
    acceptance,
    accepted: Object.values(acceptance).every(Boolean),
  };
};
