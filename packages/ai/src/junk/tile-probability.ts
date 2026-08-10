/**
 * Hypergeometric "at least one hit" probability: draws `draws` tiles without
 * replacement from a population of `populationSize` tiles that contains
 * `successCount` targets, and returns the chance at least one draw is a hit.
 *
 * Computed as the complement of the all-miss probability, built as a running
 * product (Πᵢ (miss-i)/(population-i)) rather than via `nCr(...)` directly —
 * stays numerically stable for the tile counts this project deals with
 * (populations up to ~136) without ever materializing a large factorial.
 */
export const probabilityAtLeastOneDraw = (
  populationSize: number,
  successCount: number,
  draws: number,
): number => {
  if (draws <= 0 || successCount <= 0 || populationSize <= 0) return 0;
  if (successCount >= populationSize || draws >= populationSize) return 1;
  const missCount = populationSize - successCount;
  let probabilityOfNoHit = 1;
  for (let i = 0; i < draws; i += 1) {
    probabilityOfNoHit *= (missCount - i) / (populationSize - i);
  }
  return 1 - probabilityOfNoHit;
};
