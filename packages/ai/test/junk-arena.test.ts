import { createPrng, nextUint32, SEAT_IDS } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import {
  playJunkMatch,
  strengthPolicy,
  type SeatPolicy,
} from "../src/junk/evaluation/match/arena.ts";
import { createJunkAnalysisCache } from "../src/junk/strategy.ts";

const GAMES = 30;

/** Deterministic [0, 1) generator so temperature>0 seats replay the exact same
 * sample sequence across runs — without this, strengthPolicy's default Math.random
 * fallback makes the strength-sensitivity test flaky. */
const seededRandom = (seed: number): (() => number) => {
  let prng = createPrng(seed);
  return () => {
    const step = nextUint32(prng);
    prng = step.prng;
    return step.value / 0x1_0000_0000;
  };
};

describe("junk self-play arena", () => {
  it(
    "runs full sessions end-to-end and keeps every session's cumulative score zero-sum",
    { tags: ["slow"] },
    () => {
      const policies = [
        strengthPolicy(),
        strengthPolicy(),
        strengthPolicy(),
        strengthPolicy(),
      ] as const;
      for (let seed = 1; seed <= GAMES; seed += 1) {
        const result = playJunkMatch(seed, policies);
        if ("error" in result) throw new Error(`seed ${seed}: ${result.error}`);
        const total = result.scores.reduce((sum, score) => sum + score, 0);
        expect(total).toBe(0);
      }
    },
  );

  it("ranking always covers exactly the four seats", () => {
    const policies = [
      strengthPolicy(),
      strengthPolicy(),
      strengthPolicy(),
      strengthPolicy(),
    ] as const;
    const result = playJunkMatch(1, policies);
    if ("error" in result) throw new Error(result.error);
    expect([...result.ranking].sort((a, b) => a - b)).toEqual([...SEAT_IDS]);
  });

  it("keeps structural analysis context across a seat's decisions", () => {
    const caches = [0, 1, 2, 3].map(() => createJunkAnalysisCache(32));
    const policies = caches.map((cache) => strengthPolicy({ analysisCache: cache })) as [
      SeatPolicy,
      SeatPolicy,
      SeatPolicy,
      SeatPolicy,
    ];
    const result = playJunkMatch(1, policies);
    if ("error" in result) throw new Error(result.error);

    expect(caches.some((cache) => cache.hits > 0)).toBe(true);
    expect(caches.every((cache) => cache.size > 0 && cache.size <= 32)).toBe(true);
  });

  it(
    "a low-temperature (strong) seat outranks a high-temperature (weak) seat on average",
    { tags: ["slow"] },
    () => {
      // Seat 0 plays near-deterministic argmax; seat 2 plays near-uniform-random over
      // the same scores. If the arena is sensitive to strength at all, seat 0 should
      // rank ahead of seat 2 far more often than not across repeated sessions. Both
      // temperature>0 policies get a seeded random source so the whole match — deal
      // and action sampling alike — is fully reproducible, not just the deal.
      const policies = [
        strengthPolicy({ temperature: 0.001, random: seededRandom(1) }),
        strengthPolicy(),
        strengthPolicy({ temperature: 200, random: seededRandom(2) }),
        strengthPolicy(),
      ] as const;
      let strongBeatsWeak = 0;
      let decisive = 0;
      for (let seed = 1; seed <= GAMES; seed += 1) {
        const result = playJunkMatch(seed, policies);
        if ("error" in result) throw new Error(`seed ${seed}: ${result.error}`);
        const strongRank = result.ranking.indexOf(0);
        const weakRank = result.ranking.indexOf(2);
        if (strongRank === weakRank) continue;
        decisive += 1;
        if (strongRank < weakRank) strongBeatsWeak += 1;
      }
      expect(decisive).toBeGreaterThan(0);
      expect(strongBeatsWeak / decisive).toBeGreaterThan(0.6);
    },
  );
});
