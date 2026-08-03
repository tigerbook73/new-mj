import type { PlayerViewBase, SeatId } from "@new-mj/protocol";

type SeatSlice = { handCount: number; discards?: unknown[] };
type ViewSlice = { seats?: SeatSlice[] };

export type HandVisualToken = { key: string; tileId?: number };

type Track = {
  mode: "known" | "hidden";
  tokens: HandVisualToken[];
  /** Monotonic only for hidden slots; never derive this from a sparse token array. */
  nextHiddenSerial: number;
};

const tracks = new Map<SeatId, Track>();
const discardOrigins = new Map<string, { rect: DOMRect; concealed: boolean }>();

const seatSlice = (view: PlayerViewBase, seat: SeatId): SeatSlice | undefined =>
  (view as unknown as ViewSlice).seats?.[seat];

const hiddenTokens = (seat: SeatId, count: number, serial = 0): HandVisualToken[] =>
  Array.from({ length: count }, (_, index) => ({ key: `back:${seat}:${serial + index}` }));

const knownTokens = (tiles: readonly number[]): HandVisualToken[] =>
  tiles.map((tileId) => ({ key: `tile:${tileId}`, tileId }));

/** A stable, cosmetic choice only: it must never be read as a concealed TileId. */
const discardIndex = (seat: SeatId, discardCount: number, tokenCount: number): number =>
  tokenCount === 0 ? 0 : ((seat * 17 + discardCount * 31 + tokenCount * 13) >>> 0) % tokenCount;

export function resetHandVisualLedger(): void {
  tracks.clear();
  discardOrigins.clear();
}

/**
 * Synchronises token identities before React swaps the authoritative snapshot.
 * It intentionally owns only decorative identity/geometry: `PlayerView` remains
 * the sole source of hand counts and real cards.
 */
export function registerHandVisualSnapshot(
  prev: PlayerViewBase | null,
  next: PlayerViewBase,
  mySeat: SeatId,
  gameNumber: number,
  prevGod?: readonly (readonly number[])[],
  nextGod?: readonly (readonly number[])[],
): void {
  // A first/reconnect snapshot must not animate, but it must establish the
  // same concealed visual-token identities that the first live discard will
  // later remove and measure. Without this, that first discard falls back to
  // the whole hand-track rect while every subsequent discard has an origin.
  if (!prev) {
    for (const seat of [0, 1, 2, 3] as const satisfies readonly SeatId[]) {
      const nextKnown = seat === mySeat ? next.hand : nextGod?.[seat];
      const nextCount = nextKnown?.length ?? seatSlice(next, seat)?.handCount ?? 0;
      tracks.set(seat, {
        mode: nextKnown ? "known" : "hidden",
        tokens: nextKnown ? knownTokens(nextKnown) : hiddenTokens(seat, nextCount),
        nextHiddenSerial: nextKnown ? 0 : nextCount,
      });
    }
    return;
  }
  for (const seat of [0, 1, 2, 3] as const satisfies readonly SeatId[]) {
    const prevKnown = seat === mySeat ? prev.hand : prevGod?.[seat];
    const nextKnown = seat === mySeat ? next.hand : nextGod?.[seat];
    const mode = nextKnown ? "known" : "hidden";
    const nextCount = nextKnown?.length ?? seatSlice(next, seat)?.handCount ?? 0;
    const existing = tracks.get(seat);
    if (existing?.mode !== undefined && existing.mode !== mode) {
      // Toggling God mode is a presentation preference, not a game event.
      tracks.set(seat, {
        mode,
        tokens: nextKnown ? knownTokens(nextKnown) : hiddenTokens(seat, nextCount),
        nextHiddenSerial: nextKnown ? 0 : nextCount,
      });
      continue;
    }

    const prevCount = prevKnown?.length ?? seatSlice(prev, seat)?.handCount ?? 0;
    const current = existing ?? {
      mode,
      tokens: prevKnown ? knownTokens(prevKnown) : hiddenTokens(seat, prevCount),
      nextHiddenSerial: prevKnown ? 0 : prevCount,
    };
    const nextDiscardCount = seatSlice(next, seat)?.discards?.length ?? 0;
    const isPlainDiscard =
      prevCount === nextCount + 1 &&
      nextDiscardCount > (seatSlice(prev, seat)?.discards?.length ?? 0);
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
        // The reflow token sits on a full-height layout wrapper. A flight
        // must instead start from the nested tile-sized anchor; otherwise a
        // rotated left/right wrapper's screen rect is not the card's painted
        // box. Keep the wrapper selector only as a defensive fallback for a
        // transient legacy DOM during hot reload.
        const rect =
          typeof document === "undefined"
            ? undefined
            : (document
                .querySelector(`[data-hand-flight-token="${removed.key}"]`)
                ?.getBoundingClientRect() ??
              document
                .querySelector(`[data-hand-token="${removed.key}"]`)
                ?.getBoundingClientRect());
        if (rect)
          discardOrigins.set(`g${gameNumber}:discard:${seat}:${nextDiscardCount - 1}`, {
            rect,
            concealed: removed.tileId === undefined,
          });
        tracks.set(seat, {
          mode,
          tokens: current.tokens.filter((token) => token !== removed),
          nextHiddenSerial: current.nextHiddenSerial,
        });
        continue;
      }
    }

    // Draws and claims do not need a false per-card story. Preserve known
    // identities when possible; concealed rows merely grow/shrink at the end.
    if (nextKnown) tracks.set(seat, { mode, tokens: knownTokens(nextKnown), nextHiddenSerial: 0 });
    else {
      const kept = current.tokens.slice(0, nextCount);
      const added = hiddenTokens(seat, nextCount - kept.length, current.nextHiddenSerial);
      tracks.set(seat, {
        mode,
        tokens: kept.length === nextCount ? kept : [...kept, ...added],
        nextHiddenSerial: current.nextHiddenSerial + added.length,
      });
    }
  }
}

export function handVisualTokens(
  seat: SeatId,
  fallback: readonly number[],
  revealed: boolean,
): HandVisualToken[] {
  const track = tracks.get(seat);
  // Concealed hand DOM must never carry a TileId, even if a caller
  // accidentally registered omniscient data while God mode was hidden.
  // Keep an existing hidden track for stable reflow keys; discard any known
  // track in favour of fresh cosmetic slots.
  if (!revealed) {
    if (track?.mode === "hidden") return track.tokens;
    return hiddenTokens(seat, fallback.filter((tile) => tile >= 0).length);
  }
  if (!track) return knownTokens(fallback.filter((tile) => tile >= 0));
  return track.tokens;
}

export function discardFlightOrigin(
  key: string,
): { rect: DOMRect; concealed: boolean } | undefined {
  return discardOrigins.get(key);
}
