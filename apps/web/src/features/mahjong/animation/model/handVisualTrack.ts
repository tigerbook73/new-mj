export type HandVisualToken = { key: string; tileId?: number };

export type HandVisualTrack = {
  mode: "known" | "hidden";
  tokens: HandVisualToken[];
  /** Monotonic only for hidden slots; never derive this from a sparse token array. */
  nextHiddenSerial: number;
};

export type ReconcileHandVisualTrackInput = {
  seat: number;
  existing?: HandVisualTrack | undefined;
  prevKnown?: readonly number[] | undefined;
  nextKnown?: readonly number[] | undefined;
  prevCount: number;
  nextCount: number;
  prevDiscardCount: number;
  nextDiscardCount: number;
};

export type ReconcileHandVisualTrackResult = {
  track: HandVisualTrack;
  removed?: HandVisualToken;
};

export const hiddenTokens = (seat: number, count: number, serial = 0): HandVisualToken[] =>
  Array.from({ length: count }, (_, index) => ({ key: `back:${seat}:${serial + index}` }));

export const knownTokens = (tiles: readonly number[]): HandVisualToken[] =>
  tiles.map((tileId) => ({ key: `tile:${tileId}`, tileId }));

export function initialiseHandVisualTrack(
  seat: number,
  known: readonly number[] | undefined,
  count: number,
): HandVisualTrack {
  return {
    mode: known ? "known" : "hidden",
    tokens: known ? knownTokens(known) : hiddenTokens(seat, count),
    nextHiddenSerial: known ? 0 : count,
  };
}

export function handTokensForPresentation(
  track: HandVisualTrack | undefined,
  seat: number,
  fallback: readonly number[],
  revealed: boolean,
): HandVisualToken[] {
  if (!revealed) {
    if (track?.mode === "hidden") return track.tokens;
    return hiddenTokens(seat, fallback.filter((tile) => tile >= 0).length);
  }
  return track?.tokens ?? knownTokens(fallback.filter((tile) => tile >= 0));
}

/** A stable, cosmetic choice only: it must never be read as a concealed TileId. */
const discardIndex = (seat: number, discardCount: number, tokenCount: number): number =>
  tokenCount === 0 ? 0 : ((seat * 17 + discardCount * 31 + tokenCount * 13) >>> 0) % tokenCount;

/**
 * Pure identity reconciliation for one hand row. Geometry capture deliberately
 * stays outside this model: callers may use the removed cosmetic token to
 * measure a DOM anchor before React applies the authoritative snapshot.
 */
export function reconcileHandVisualTrack({
  seat,
  existing,
  prevKnown,
  nextKnown,
  prevCount,
  nextCount,
  prevDiscardCount,
  nextDiscardCount,
}: ReconcileHandVisualTrackInput): ReconcileHandVisualTrackResult {
  const mode = nextKnown ? "known" : "hidden";
  if (existing?.mode !== undefined && existing.mode !== mode) {
    return { track: initialiseHandVisualTrack(seat, nextKnown, nextCount) };
  }

  const current = existing ?? initialiseHandVisualTrack(seat, prevKnown, prevCount);
  const isPlainDiscard = prevCount === nextCount + 1 && nextDiscardCount > prevDiscardCount;
  if (isPlainDiscard) {
    let removed: HandVisualToken | undefined;
    if (nextKnown && prevKnown) {
      const nextIds = new Set(nextKnown);
      removed = current.tokens.find(
        (token) => token.tileId !== undefined && !nextIds.has(token.tileId),
      );
    } else {
      removed = current.tokens[discardIndex(seat, nextDiscardCount - 1, current.tokens.length)];
    }
    if (removed) {
      return {
        removed,
        track: {
          mode,
          tokens: current.tokens.filter((token) => token !== removed),
          nextHiddenSerial: current.nextHiddenSerial,
        },
      };
    }
  }

  if (nextKnown) return { track: initialiseHandVisualTrack(seat, nextKnown, nextCount) };
  const kept = current.tokens.slice(0, nextCount);
  const added = hiddenTokens(seat, nextCount - kept.length, current.nextHiddenSerial);
  return {
    track: {
      mode,
      tokens: kept.length === nextCount ? kept : [...kept, ...added],
      nextHiddenSerial: current.nextHiddenSerial + added.length,
    },
  };
}
