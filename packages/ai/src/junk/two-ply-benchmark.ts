import { tileIdOf, type TileId, type TileKind } from "@new-mj/core";
import { probeSelfDrawTwoPly, type GameProgress, type SelfDrawTwoPlyProbe } from "./strategy.ts";

const ids = (kinds: readonly TileKind[]): TileId[] => {
  const copies = new Map<TileKind, number>();
  return kinds.map((kind) => {
    const copy = copies.get(kind) ?? 0;
    copies.set(kind, copy + 1);
    return tileIdOf(kind, copy);
  });
};

/** A representative 13-tile shape from the two-ply bridge fixture. Keeping
 * this fixture fixed makes profiles comparable across optimization attempts. */
const BENCHMARK_INPUT = {
  hand: ids(["1p", "2p", "3p", "4p", "5p", "6p", "7s", "8s", "9s", "1z", "1z", "3m", "6m"]),
  melds: [],
} as const;

const BENCHMARK_PROGRESS: GameProgress = { wallCount: 84, unseenPoolSize: 123 };

export type SelfDrawTwoPlyBenchmark = Readonly<{
  iterations: number;
  elapsedMs: number;
  msPerProbe: number;
  /** Stops an optimizing compiler from treating repeated calls as unused and
   * provides a stable sanity check for the benchmark fixture. */
  checksum: number;
}>;

/** Runs the fixed Phase-2 diagnostic probe repeatedly, outside Vitest/Vite, so
 * `node --cpu-prof` can attribute samples to the actual decision path. */
export const benchmarkSelfDrawTwoPly = (iterations: number): SelfDrawTwoPlyBenchmark => {
  if (!Number.isSafeInteger(iterations) || iterations <= 0)
    throw new Error("iterations must be a positive safe integer");

  const startedAt = performance.now();
  let checksum = 0;
  for (let index = 0; index < iterations; index += 1) {
    const probe: SelfDrawTwoPlyProbe = probeSelfDrawTwoPly(
      BENCHMARK_INPUT,
      [],
      undefined,
      BENCHMARK_PROGRESS,
    );
    checksum += probe.continuationValue + probe.winProbability + probe.continuationProbability;
  }
  const elapsedMs = performance.now() - startedAt;
  return { iterations, elapsedMs, msPerProbe: elapsedMs / iterations, checksum };
};
