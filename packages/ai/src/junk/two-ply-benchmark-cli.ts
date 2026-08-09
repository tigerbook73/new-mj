import {
  BENCHMARK_INPUT,
  BENCHMARK_PROGRESS,
  benchmarkSelfDrawTwoPly,
  benchmarkSelfDrawTwoPlyCandidateSuite,
  benchmarkConservativeStructuralSuite,
  benchmarkStructuralTwoPlyCandidateSuite,
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
