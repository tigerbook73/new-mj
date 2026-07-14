import type { TileId } from "./types.ts";
import type { TileSet } from "./tiles.ts";

const isSuit = (kind: string): boolean => kind.endsWith("m") || kind.endsWith("p") || kind.endsWith("s");

const canFormMelds = (counts: number[], tileSet: TileSet): boolean => {
  const index = counts.findIndex((count) => count > 0);
  if (index === -1) return true;
  if ((counts[index] ?? 0) >= 3) {
    const next = [...counts];
    next[index] = (next[index] ?? 0) - 3;
    if (canFormMelds(next, tileSet)) return true;
  }
  const kind = tileSet.kinds[index] as string;
  const rank = Number(kind[0]);
  const nextKinds = [`${rank + 1}${kind[1]}`, `${rank + 2}${kind[1]}`];
  const first = tileSet.kinds.indexOf(nextKinds[0] as never);
  const second = tileSet.kinds.indexOf(nextKinds[1] as never);
  if (
    isSuit(kind) &&
    rank <= 7 &&
    first >= 0 &&
    second >= 0 &&
    (counts[first] ?? 0) > 0 &&
    (counts[second] ?? 0) > 0
  ) {
    const next = [...counts];
    next[index] = (next[index] ?? 0) - 1;
    next[first] = (next[first] ?? 0) - 1;
    next[second] = (next[second] ?? 0) - 1;
    if (canFormMelds(next, tileSet)) return true;
  }
  return false;
};

/** Standard four-meld-plus-pair hand check; exposed melds are excluded by callers. */
export const isStandardWinningHand = (tiles: readonly TileId[], tileSet: TileSet): boolean => {
  if (tiles.length % 3 !== 2) return false;
  const counts = tileSet.kinds.map(() => 0);
  for (const tile of tiles) {
    const index = tileSet.kinds.indexOf(tileSet.kindOf(tile));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  for (let index = 0; index < counts.length; index += 1) {
    if ((counts[index] ?? 0) < 2) continue;
    const remaining = [...counts];
    remaining[index] = (remaining[index] ?? 0) - 2;
    if (canFormMelds(remaining, tileSet)) return true;
  }
  return false;
};

export const isSevenPairsWinningHand = (tiles: readonly TileId[], tileSet: TileSet): boolean => {
  if (tiles.length !== 14) return false;
  const counts = tileSet.kinds.map(() => 0);
  for (const tile of tiles) {
    const index = tileSet.kinds.indexOf(tileSet.kindOf(tile));
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts.filter((count) => count > 0).every((count) => count === 2);
};
