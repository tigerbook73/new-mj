import { mkdirSync, writeFileSync } from "node:fs";
import { allTileIds, createPrng, nextInt, shuffle, tileIdOf, type Meld, type TileId } from "@new-mj/core";
import {
  BENCHMARK_PROGRESS,
  evaluateConservativeStructuralCandidates,
  evaluateSelfDrawTwoPlyCandidates,
  type BenchmarkShape,
} from "./two-ply-benchmark.ts";

type SearchCase = Readonly<{
  seed: number;
  hand: readonly TileId[];
  melds: readonly Meld[];
  visibleDiscards: readonly TileId[];
  fullBest: string | undefined;
  conservativeBest: string | undefined;
  fullValue: number | undefined;
  conservativeValue: number | undefined;
  candidateCount: number;
  conservativeCount: number;
}>;

const makeMelds = (count: number): { melds: Meld[]; used: Set<TileId> } => {
  const meldKinds = [
    ["1m", "2m", "3m"],
    ["4m", "5m", "6m"],
  ] as const;
  const melds: Meld[] = [];
  const used = new Set<TileId>();
  for (let index = 0; index < count; index += 1) {
    const kinds = meldKinds[index]!;
    const tiles = kinds.map((kind) => tileIdOf(kind, 0));
    tiles.forEach((tile) => used.add(tile));
    melds.push({ type: "chi", tiles });
  }
  return { melds, used };
};

const makeCase = (seed: number): { input: BenchmarkShape; visibleDiscards: TileId[] } => {
  const prng = createPrng(seed);
  const meldCount = nextInt(prng, 3).value;
  const { melds, used } = makeMelds(meldCount);
  const available = allTileIds().filter((tile) => !used.has(tile));
  const shuffled = shuffle(available, createPrng(seed ^ 0x51ed_1234)).items;
  const handCount = 13 - meldCount * 3;
  const hand = shuffled.slice(0, handCount);
  const visibleCount = nextInt(createPrng(seed ^ 0x7eed_4321), 10).value;
  const visibleDiscards = shuffled.slice(handCount, handCount + visibleCount);
  return { input: { hand, melds }, visibleDiscards };
};

const [countArgument, outputArgument] = process.argv.slice(2);
const count = countArgument === undefined ? 1000 : Number(countArgument);
const outputPath = outputArgument ?? "benchmark-data/junk-two-ply-adversarial-cases.json";
const startedAt = performance.now();
const mismatches: SearchCase[] = [];
for (let index = 0; index < count; index += 1) {
  const seed = 0x71_2a1f + index;
  const { input, visibleDiscards } = makeCase(seed);
  const full = evaluateSelfDrawTwoPlyCandidates(
    input,
    visibleDiscards,
    undefined,
    BENCHMARK_PROGRESS,
    Number.POSITIVE_INFINITY,
  );
  const conservative = evaluateConservativeStructuralCandidates(
    input,
    visibleDiscards,
    undefined,
    BENCHMARK_PROGRESS,
  );
  if (full.bestKind === conservative.bestKind) continue;
  mismatches.push({
    seed,
    hand: input.hand,
    melds: input.melds,
    visibleDiscards,
    fullBest: full.bestKind,
    conservativeBest: conservative.bestKind,
    fullValue: full.bestValue,
    conservativeValue: conservative.bestValue,
    candidateCount: full.candidates.length,
    conservativeCount: conservative.candidates.length,
  });
}
mkdirSync(outputPath.slice(0, outputPath.lastIndexOf("/")) || ".", { recursive: true });
const elapsedMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
writeFileSync(outputPath, `${JSON.stringify({ count, elapsedMs, mismatches })}\n`);
process.stdout.write(`${JSON.stringify({ count, mismatchCount: mismatches.length, elapsedMs, outputPath })}\n`);
