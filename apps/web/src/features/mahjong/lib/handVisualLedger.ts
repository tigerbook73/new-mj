import type { PlayerViewBase, SeatId } from "@new-mj/protocol";

type SeatSlice = { handCount: number; discards?: unknown[] };
type ViewSlice = { seats?: SeatSlice[] };

export type HandVisualToken = { key: string; tileId?: number };

type Track = { mode: "known" | "hidden"; tokens: HandVisualToken[] };

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
  if (!prev) return;
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
      });
      continue;
    }

    const prevCount = prevKnown?.length ?? seatSlice(prev, seat)?.handCount ?? 0;
    const current = existing ?? {
      mode,
      tokens: prevKnown ? knownTokens(prevKnown) : hiddenTokens(seat, prevCount),
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
        const rect = document
          .querySelector(`[data-hand-token="${removed.key}"]`)
          ?.getBoundingClientRect();
        if (rect)
          discardOrigins.set(`g${gameNumber}:discard:${seat}:${nextDiscardCount - 1}`, {
            rect,
            concealed: removed.tileId === undefined,
          });
        tracks.set(seat, { mode, tokens: current.tokens.filter((token) => token !== removed) });
        continue;
      }
    }

    // Draws and claims do not need a false per-card story. Preserve known
    // identities when possible; concealed rows merely grow/shrink at the end.
    if (nextKnown) tracks.set(seat, { mode, tokens: knownTokens(nextKnown) });
    else {
      const kept = current.tokens.slice(0, nextCount);
      tracks.set(seat, {
        mode,
        tokens:
          kept.length === nextCount
            ? kept
            : [...kept, ...hiddenTokens(seat, nextCount - kept.length, current.tokens.length)],
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
  if (!track)
    return revealed
      ? knownTokens(fallback.filter((tile) => tile >= 0))
      : hiddenTokens(seat, fallback.filter((tile) => tile >= 0).length);
  return track.tokens;
}

export function discardFlightOrigin(
  key: string,
): { rect: DOMRect; concealed: boolean } | undefined {
  return discardOrigins.get(key);
}
