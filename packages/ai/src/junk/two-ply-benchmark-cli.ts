import {
  BENCHMARK_INPUT,
  BENCHMARK_PROGRESS,
  benchmarkSelfDrawTwoPly,
  benchmarkSelfDrawTwoPlyCandidateSuite,
  benchmarkConservativeStructuralSuite,
  benchmarkStructuralTwoPlyCandidateSuite,
  benchmarkWeightedTrajectoryTwoPlyCandidateSuite,
  benchmarkDynamicWeightedTrajectorySuite,
  benchmarkSharedStructuralCacheSuite,
  benchmarkCrossCandidateDrawOverlap,
  benchmarkSecondDiscardWhitelistSuite,
  benchmarkDynamicSecondDiscardWhitelistSuite,
  benchmarkTwoChangeBatchSuite,
  benchmarkTieredTwoPlyCandidateSuite,
  evaluateSelfDrawTwoPlyCandidates,
} from "./two-ply-benchmark.ts";

const [iterationsArgument, candidateLimitArgument, fixtureCountArgument, budgetArgument] =
  process.argv.slice(2);
const iterations = iterationsArgument === undefined ? 25 : Number(iterationsArgument);
const fixtureCount = fixtureCountArgument === undefined ? 8 : Number(fixtureCountArgument);
const budget = budgetArgument === undefined ? undefined : Number(budgetArgument);
const candidateLimit =
  candidateLimitArgument === undefined ? undefined : Number(candidateLimitArgument);
if (candidateLimitArgument === "blacklist") {
  process.stdout.write(
    `${JSON.stringify(benchmarkConservativeStructuralSuite(iterations, fixtureCount))}\n`,
  );
} else if (candidateLimitArgument === "structural") {
  const limits = budget === undefined ? undefined : [budget, Number.POSITIVE_INFINITY];
  process.stdout.write(
    `${JSON.stringify(benchmarkStructuralTwoPlyCandidateSuite(iterations, limits, fixtureCount))}\n`,
  );
} else if (candidateLimitArgument === "trajectory") {
  const limits = budget === undefined ? undefined : [budget, Number.POSITIVE_INFINITY];
  process.stdout.write(
    `${JSON.stringify(benchmarkWeightedTrajectoryTwoPlyCandidateSuite(iterations, limits, fixtureCount))}\n`,
  );
} else if (candidateLimitArgument === "dynamic") {
  process.stdout.write(
    `${JSON.stringify(benchmarkDynamicWeightedTrajectorySuite(iterations, undefined, fixtureCount))}\n`,
  );
} else if (candidateLimitArgument === "shared-cache") {
  const candidateLimit = budget === undefined ? 4 : budget;
  process.stdout.write(
    `${JSON.stringify(benchmarkSharedStructuralCacheSuite(iterations, candidateLimit, fixtureCount))}\n`,
  );
} else if (candidateLimitArgument === "overlap") {
  const candidateLimit = budget === undefined ? 4 : budget;
  process.stdout.write(
    `${JSON.stringify(benchmarkCrossCandidateDrawOverlap(iterations, candidateLimit, fixtureCount))}\n`,
  );
} else if (candidateLimitArgument === "second-whitelist") {
  const firstLimit = budget === undefined ? 4 : budget;
  const whitelistSize = Number(process.argv[5] ?? 4);
  process.stdout.write(
    `${JSON.stringify(benchmarkSecondDiscardWhitelistSuite(iterations, firstLimit, whitelistSize, fixtureCount))}\n`,
  );
} else if (candidateLimitArgument === "dynamic-second-whitelist") {
  const firstLimit = budget === undefined ? 4 : budget;
  process.stdout.write(
    `${JSON.stringify(benchmarkDynamicSecondDiscardWhitelistSuite(iterations, firstLimit, undefined, fixtureCount))}\n`,
  );
} else if (candidateLimitArgument === "two-change-batch") {
  const candidateLimit = budget === undefined ? 4 : budget;
  process.stdout.write(
    `${JSON.stringify(benchmarkTwoChangeBatchSuite(iterations, candidateLimit, fixtureCount))}\n`,
  );
} else if (candidateLimitArgument === "tiered") {
  process.stdout.write(
    `${JSON.stringify(benchmarkTieredTwoPlyCandidateSuite(iterations, undefined, fixtureCount))}\n`,
  );
} else if (candidateLimitArgument === "suite") {
  process.stdout.write(
    `${JSON.stringify(benchmarkSelfDrawTwoPlyCandidateSuite(iterations, undefined, fixtureCount))}\n`,
  );
} else if (candidateLimit !== undefined) {
  const results = Array.from({ length: iterations }, () =>
    evaluateSelfDrawTwoPlyCandidates(
      BENCHMARK_INPUT,
      [],
      undefined,
      BENCHMARK_PROGRESS,
      candidateLimit,
    ),
  );
  const elapsedMs = results.reduce((sum, result) => sum + result.elapsedMs, 0);
  process.stdout.write(
    `${JSON.stringify({
      iterations,
      candidateLimit,
      elapsedMs,
      msPerProbe: elapsedMs / iterations,
      bestKinds: results.map((result) => result.bestKind),
    })}\n`,
  );
} else {
  const result = benchmarkSelfDrawTwoPly(iterations);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
