import { resolve } from "node:path";
import {
  evaluateConservativeStructuralCandidates,
  type BenchmarkShape,
} from "./two-ply-benchmark.ts";
import { readTwoPlyBaselineCases, readTwoPlyBaselineManifest } from "./two-ply-baseline-loader.ts";

const [baselineArgument, limitArgument] = process.argv.slice(2);
const baselinePath = resolve(baselineArgument ?? "benchmark-data/junk-two-ply-baseline.jsonl");
const limit = limitArgument === undefined ? Number.POSITIVE_INFINITY : Number(limitArgument);
const manifestPath = baselinePath.endsWith(".jsonl")
  ? `${baselinePath.slice(0, -".jsonl".length)}.manifest.json`
  : `${baselinePath}.manifest.json`;
const manifest = readTwoPlyBaselineManifest(manifestPath);
let cases = 0;
let winnerAgreement = 0;
let scoreGap = 0;
let candidateCount = 0;
const startedAt = performance.now();
for await (const baseline of readTwoPlyBaselineCases(baselinePath)) {
  if (cases >= limit) break;
  const input: BenchmarkShape = { hand: baseline.hand, melds: [] };
  const candidate = evaluateConservativeStructuralCandidates(
    input,
    [],
    undefined,
    manifest.progress,
  );
  if (candidate.bestKind === baseline.bestKind) winnerAgreement += 1;
  scoreGap += (baseline.bestValue ?? 0) - (candidate.bestValue ?? 0);
  candidateCount += candidate.candidates.length;
  cases += 1;
}
const elapsedMs = performance.now() - startedAt;
process.stdout.write(
  `${JSON.stringify({
    baselinePath,
    manifestVersion: manifest.version,
    cases,
    winnerAgreement: cases === 0 ? 0 : winnerAgreement / cases,
    meanScoreGap: cases === 0 ? 0 : scoreGap / cases,
    averageCandidates: cases === 0 ? 0 : candidateCount / cases,
    elapsedMs,
    msPerCase: cases === 0 ? 0 : elapsedMs / cases,
  })}\n`,
);
