import { SEAT_IDS } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { playJunkMatch, productionPolicy } from "../src/junk/evaluation/match/arena.ts";

const GAMES = 30;

describe("junk self-play arena", () => {
  it.skip(
    "runs full sessions end-to-end and keeps every session's cumulative score zero-sum",
    { tags: ["slow"] },
    () => {
      const policies = [
        productionPolicy(),
        productionPolicy(),
        productionPolicy(),
        productionPolicy(),
      ] as const;
      for (let seed = 1; seed <= GAMES; seed += 1) {
        const result = playJunkMatch(seed, policies);
        if ("error" in result) throw new Error(`seed ${seed}: ${result.error}`);
        const total = result.scores.reduce((sum, score) => sum + score, 0);
        expect(total).toBe(0);
      }
    },
  );

  it("ranking always covers exactly the four seats", { tags: ["slow"] }, () => {
    const policies = [
      productionPolicy(),
      productionPolicy(),
      productionPolicy(),
      productionPolicy(),
    ] as const;
    const result = playJunkMatch(1, policies);
    if ("error" in result) throw new Error(result.error);
    expect([...result.ranking].sort((a, b) => a - b)).toEqual([...SEAT_IDS]);
  });
});
