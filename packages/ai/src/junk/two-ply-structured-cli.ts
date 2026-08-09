import { tileIdOf, type Meld, type TileId, type TileKind } from "@new-mj/core";
import {
  BENCHMARK_PROGRESS,
  evaluateConservativeStructuralCandidates,
  evaluateSelfDrawTwoPlyCandidates,
  evaluateStructuralTwoPlyCandidates,
  type BenchmarkShape,
} from "./two-ply-benchmark.ts";

type Fixture = Readonly<{
  name: string;
  input: BenchmarkShape;
  visibleDiscards: readonly TileId[];
}>;

const ids = (kinds: readonly TileKind[], nextCopy = new Map<TileKind, number>()): TileId[] =>
  kinds.map((kind) => {
    const copy = nextCopy.get(kind) ?? 0;
    nextCopy.set(kind, copy + 1);
    return tileIdOf(kind, copy);
  });

const meld = (type: Meld["type"], kinds: readonly TileKind[]): Meld => ({
  type,
  tiles: ids(kinds),
});

const fixtures: readonly Fixture[] = [
  {
    name: "triplet-and-honor-pair",
    input: {
      hand: ids(["1m", "2m", "3m", "4m", "5m", "6m", "7z", "7z", "7z", "1p", "1p", "2s", "3s"]),
      melds: [],
    },
    visibleDiscards: [],
  },
  {
    name: "isolated-234-block",
    input: {
      hand: ids(["1p", "2p", "3p", "4p", "5p", "6p", "7s", "8s", "9s", "2m", "3m", "7z", "1z"]),
      melds: [],
    },
    visibleDiscards: [],
  },
  {
    name: "seven-pairs-trajectory",
    input: {
      hand: ids(["1m", "1m", "3m", "3m", "5p", "5p", "7p", "7p", "2s", "2s", "4s", "4s", "6z"]),
      melds: [],
    },
    visibleDiscards: [],
  },
  {
    name: "open-chi-meld",
    input: {
      hand: ids(["4m", "5m", "6m", "7p", "8p", "2s", "3s", "5s", "5s", "1z"]),
      melds: [meld("chi", ["1m", "2m", "3m"])],
    },
    visibleDiscards: [],
  },
  {
    name: "dead-bridge-copies",
    input: {
      hand: ids(["1m", "2m", "3m", "4p", "5p", "6p", "7s", "8s", "9s", "3z", "3z", "4m", "6m"]),
      melds: [],
    },
    visibleDiscards: ids(["4m", "4m", "4m", "5m", "5m", "5m", "6m"]),
  },
  {
    name: "equal-shanten-unequal-ukeire",
    input: {
      hand: ids(["1m", "2m", "4m", "5m", "7p", "8p", "2s", "3s", "7s", "8s", "1z", "2z", "5z"]),
      melds: [],
    },
    visibleDiscards: [],
  },
  {
    name: "pure-suit-drift",
    input: {
      hand: ids(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "5z", "7z"]),
      melds: [],
    },
    visibleDiscards: [],
  },
  {
    name: "mixed-one-suit-pair",
    input: {
      hand: ids(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "5s", "7z"]),
      melds: [],
    },
    visibleDiscards: ids(["1p", "5s", "7z"]),
  },
  {
    name: "honor-triplet-future",
    input: {
      hand: ids(["1m", "1m", "1m", "2p", "2p", "2p", "3s", "3s", "3s", "7z", "7z", "5z", "6z"]),
      melds: [],
    },
    visibleDiscards: ids(["1z", "2z", "3z", "4z"]),
  },
  {
    name: "seven-pairs-versus-suit",
    input: {
      hand: ids(["1m", "1m", "2m", "2m", "3m", "3m", "4m", "4m", "5m", "5m", "6p", "6p", "7z"]),
      melds: [],
    },
    visibleDiscards: ids(["1p", "2p", "3p", "4p", "5p"]),
  },
  {
    name: "terminal-heavy-future",
    input: {
      hand: ids(["1m", "1m", "9m", "9m", "1p", "1p", "9p", "9p", "1s", "9s", "1z", "1z", "7z"]),
      melds: [],
    },
    visibleDiscards: ids(["2m", "3m", "7m", "8m", "2p", "8p", "2s", "8s"]),
  },
  {
    name: "open-pure-suit-drift",
    input: {
      hand: ids(["4m", "5m", "6m", "7m", "8m", "2m", "3m", "9m", "9m", "1p"]),
      melds: [meld("chi", ["1m", "2m", "3m"])],
    },
    visibleDiscards: ids(["1p", "5z", "6z"]),
  },
];

for (const fixture of fixtures) {
  const startedAt = performance.now();
  const full = evaluateSelfDrawTwoPlyCandidates(
    fixture.input,
    fixture.visibleDiscards,
    undefined,
    BENCHMARK_PROGRESS,
    Number.POSITIVE_INFINITY,
  );
  const structuralTop4 = evaluateStructuralTwoPlyCandidates(
    fixture.input,
    fixture.visibleDiscards,
    undefined,
    BENCHMARK_PROGRESS,
    4,
  );
  const conservative = evaluateConservativeStructuralCandidates(
    fixture.input,
    fixture.visibleDiscards,
    undefined,
    BENCHMARK_PROGRESS,
  );
  process.stdout.write(
    `${JSON.stringify({
      name: fixture.name,
      candidateCount: full.candidates.length,
      conservativeCandidates: conservative.candidates.length,
      fullBest: full.bestKind,
      structuralTop4Best: structuralTop4.bestKind,
      conservativeBest: conservative.bestKind,
      structuralTop4Match: structuralTop4.bestKind === full.bestKind,
      conservativeMatch: conservative.bestKind === full.bestKind,
      structuralTop4Gap: (full.bestValue ?? 0) - (structuralTop4.bestValue ?? 0),
      conservativeGap: (full.bestValue ?? 0) - (conservative.bestValue ?? 0),
      elapsedMs: performance.now() - startedAt,
    })}\n`,
  );
}
