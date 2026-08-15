import { chooseJunkAction, DEFAULT_JUNK_WEIGHTS, type JunkWeights } from "../strategy.ts";
import { generateJunkSamples, normalizeGeneratedJunkSample } from "./generated-samples.ts";
import { contentHashOf } from "./hash.ts";
import { evaluateStructuralMetrics } from "./structural-metrics.ts";

export type StructuralValidationSplit = Readonly<{
  seed: number;
  scenarioCount: number;
  decisionDifferenceCount: number;
  decisionDifferenceScenarioSeeds: readonly number[];
  baselineDominatedSelectionCount: number;
  candidateDominatedSelectionCount: number;
  baselineDominatedScenarioSeeds: readonly number[];
  candidateDominatedScenarioSeeds: readonly number[];
}>;

export type PairedStructuralValidation = Readonly<{
  protocolVersion: "paired-standard-heldout-v1";
  generatorVersion: "standard-concealed-v1";
  candidate: Readonly<{ isolationPotential: number }>;
  development: StructuralValidationSplit;
  heldOut: StructuralValidationSplit;
  splitDisjoint: true;
  accepted: boolean;
  acceptance: Readonly<{
    developmentDominatedSelectionsDidNotIncrease: boolean;
    heldOutDominatedSelectionsDidNotIncrease: boolean;
  }>;
}>;

export const structuralGateAcceptance = (
  development: Pick<
    StructuralValidationSplit,
    "baselineDominatedSelectionCount" | "candidateDominatedSelectionCount"
  >,
  heldOut: Pick<
    StructuralValidationSplit,
    "baselineDominatedSelectionCount" | "candidateDominatedSelectionCount"
  >,
) => ({
  developmentDominatedSelectionsDidNotIncrease:
    development.candidateDominatedSelectionCount <= development.baselineDominatedSelectionCount,
  heldOutDominatedSelectionsDidNotIncrease:
    heldOut.candidateDominatedSelectionCount <= heldOut.baselineDominatedSelectionCount,
});

type ValidationOptions = Readonly<{
  developmentSeed: number;
  heldOutSeed: number;
  count: number;
  candidateIsolationPotential?: number;
}>;

const scenarioSeed = (source: { kind: string; seed?: number }): number => {
  if (source.kind !== "generated" || source.seed === undefined) throw new Error("INVALID_SOURCE");
  return source.seed;
};

const evaluateSplit = (
  seed: number,
  count: number,
  candidateWeights: JunkWeights,
): StructuralValidationSplit => {
  const generated = generateJunkSamples({ seed, count });
  const decisionDifferenceScenarioSeeds: number[] = [];
  const baselineDominatedScenarioSeeds: number[] = [];
  const candidateDominatedScenarioSeeds: number[] = [];
  for (const sample of generated.samples) {
    const normalized = normalizeGeneratedJunkSample(sample.scenario, sample.data);
    const baseline = chooseJunkAction(normalized.input.view, normalized.input.legalActions);
    const candidate = chooseJunkAction(
      normalized.input.view,
      normalized.input.legalActions,
      {},
      candidateWeights,
    );
    const baselineId = JSON.stringify(baseline);
    const candidateId = JSON.stringify(candidate);
    if (baselineId !== candidateId) {
      decisionDifferenceScenarioSeeds.push(scenarioSeed(sample.scenario.source));
    }
    const structural = evaluateStructuralMetrics(sample.scenario.id, normalized.input);
    const byId = new Map(structural.candidates.map((entry) => [entry.candidateId, entry]));
    const baselineDominatedBy = byId.get(baselineId)?.metrics.dominatedByCandidateIds;
    const candidateDominatedBy = byId.get(candidateId)?.metrics.dominatedByCandidateIds;
    if (!Array.isArray(baselineDominatedBy) || !Array.isArray(candidateDominatedBy)) {
      throw new Error("SELECTED_CANDIDATE_MISSING_STRUCTURAL_METRICS");
    }
    if (baselineDominatedBy.length > 0) {
      baselineDominatedScenarioSeeds.push(scenarioSeed(sample.scenario.source));
    }
    if (candidateDominatedBy.length > 0) {
      candidateDominatedScenarioSeeds.push(scenarioSeed(sample.scenario.source));
    }
  }
  return {
    seed,
    scenarioCount: generated.samples.length,
    decisionDifferenceCount: decisionDifferenceScenarioSeeds.length,
    decisionDifferenceScenarioSeeds,
    baselineDominatedSelectionCount: baselineDominatedScenarioSeeds.length,
    candidateDominatedSelectionCount: candidateDominatedScenarioSeeds.length,
    baselineDominatedScenarioSeeds,
    candidateDominatedScenarioSeeds,
  };
};

/** Fixed paired development/held-out structural gate; it never mutates production weights. */
export const validatePairedStructuralCandidate = ({
  developmentSeed,
  heldOutSeed,
  count,
  candidateIsolationPotential = 0,
}: ValidationOptions): PairedStructuralValidation => {
  if (developmentSeed === heldOutSeed) throw new Error("OVERLAPPING_VALIDATION_SEEDS");
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
    throw new Error("OVERLAPPING_VALIDATION_SPLITS");
  }

  const candidateWeights: JunkWeights = {
    ...DEFAULT_JUNK_WEIGHTS,
    isolationPotential: candidateIsolationPotential,
  };
  const development = evaluateSplit(developmentSeed, count, candidateWeights);
  const heldOut = evaluateSplit(heldOutSeed, count, candidateWeights);
  const acceptance = structuralGateAcceptance(development, heldOut);
  return {
    protocolVersion: "paired-standard-heldout-v1",
    generatorVersion: "standard-concealed-v1",
    candidate: { isolationPotential: candidateIsolationPotential },
    development,
    heldOut,
    splitDisjoint: true,
    accepted:
      acceptance.developmentDominatedSelectionsDidNotIncrease &&
      acceptance.heldOutDominatedSelectionsDidNotIncrease,
    acceptance,
  };
};
