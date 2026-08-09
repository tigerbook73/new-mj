import {
  BENCHMARK_INPUT,
  BENCHMARK_PROGRESS,
  benchmarkSelfDrawTwoPly,
  evaluateSelfDrawTwoPlyCandidates,
} from "./two-ply-benchmark.ts";

const [iterationsArgument, candidateLimitArgument] = process.argv.slice(2);
const iterations = iterationsArgument === undefined ? 25 : Number(iterationsArgument);
const candidateLimit =
  candidateLimitArgument === undefined ? undefined : Number(candidateLimitArgument);
if (candidateLimit !== undefined) {
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
