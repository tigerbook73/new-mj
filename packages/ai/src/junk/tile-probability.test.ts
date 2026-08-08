import { describe, expect, it } from "vitest";
import { probabilityAtLeastOneDraw } from "./tile-probability.ts";

/** Multiplicative nCr, kept small enough to stay exact for this file's test
 * sizes — the reference formula tile-probability.ts's product form is
 * cross-checked against. */
const combinations = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1);
  return result;
};

const exactProbability = (populationSize: number, successCount: number, draws: number): number =>
  1 - combinations(populationSize - successCount, draws) / combinations(populationSize, draws);

describe("probabilityAtLeastOneDraw", () => {
  it.each([
    [10, 3, 4],
    [34, 4, 10],
    [136, 4, 34],
    [5, 2, 3],
    [8, 3, 3],
    [20, 1, 5],
  ])("matches the exact hypergeometric formula for population=%i success=%i draws=%i", (
    population,
    success,
    draws,
  ) => {
    expect(probabilityAtLeastOneDraw(population, success, draws)).toBeCloseTo(
      exactProbability(population, success, draws),
      10,
    );
  });

  it("returns 0 when there are no draws left", () => {
    expect(probabilityAtLeastOneDraw(50, 3, 0)).toBe(0);
  });

  it("returns 0 when there are no live copies", () => {
    expect(probabilityAtLeastOneDraw(50, 0, 10)).toBe(0);
  });

  it("returns 1 when every unseen tile is a target", () => {
    expect(probabilityAtLeastOneDraw(5, 5, 2)).toBe(1);
  });

  it("clamps to 1 when successCount exceeds populationSize (defensive)", () => {
    expect(probabilityAtLeastOneDraw(5, 10, 2)).toBe(1);
  });

  it("returns 1 when draws cover the entire population and a target exists", () => {
    expect(probabilityAtLeastOneDraw(5, 1, 5)).toBe(1);
  });

  it("is monotonically increasing in draws for a fixed population/success", () => {
    const probabilities = [1, 2, 3, 4, 5].map((draws) => probabilityAtLeastOneDraw(50, 3, draws));
    for (let i = 1; i < probabilities.length; i += 1) {
      expect(probabilities[i]!).toBeGreaterThan(probabilities[i - 1]!);
    }
  });

  it("is monotonically increasing in successCount for fixed population/draws", () => {
    const probabilities = [1, 2, 3, 4].map((success) =>
      probabilityAtLeastOneDraw(50, success, 10),
    );
    for (let i = 1; i < probabilities.length; i += 1) {
      expect(probabilities[i]!).toBeGreaterThan(probabilities[i - 1]!);
    }
  });
});
