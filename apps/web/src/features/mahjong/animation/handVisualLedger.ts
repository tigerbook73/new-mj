import type { PlayerViewBase, SeatId } from "@new-mj/protocol";
import {
  hiddenTokens,
  handTokensForPresentation,
  initialiseHandVisualTrack,
  knownTokens,
  reconcileHandVisualTrack,
  type HandVisualToken,
  type HandVisualTrack,
} from "@/features/mahjong/animation/model/handVisualTrack";

type SeatSlice = { handCount: number; discards?: unknown[] };
type ViewSlice = { seats?: SeatSlice[] };

export type { HandVisualToken } from "@/features/mahjong/animation/model/handVisualTrack";

const tracks = new Map<SeatId, HandVisualTrack>();
const discardOrigins = new Map<string, { rect: DOMRect; concealed: boolean }>();

const seatSlice = (view: PlayerViewBase, seat: SeatId): SeatSlice | undefined =>
  (view as unknown as ViewSlice).seats?.[seat];

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
      tracks.set(seat, initialiseHandVisualTrack(seat, nextKnown, nextCount));
    }
    return;
  }
  for (const seat of [0, 1, 2, 3] as const satisfies readonly SeatId[]) {
    const prevKnown = seat === mySeat ? prev.hand : prevGod?.[seat];
    const nextKnown = seat === mySeat ? next.hand : nextGod?.[seat];
    const nextCount = nextKnown?.length ?? seatSlice(next, seat)?.handCount ?? 0;
    const existing = tracks.get(seat);
    const prevCount = prevKnown?.length ?? seatSlice(prev, seat)?.handCount ?? 0;
    const prevDiscardCount = seatSlice(prev, seat)?.discards?.length ?? 0;
    const nextDiscardCount = seatSlice(next, seat)?.discards?.length ?? 0;
    const { removed, track } = reconcileHandVisualTrack({
      seat,
      existing,
      prevKnown,
      nextKnown,
      prevCount,
      nextCount,
      prevDiscardCount,
      nextDiscardCount,
    });
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
            document.querySelector(`[data-hand-token="${removed.key}"]`)?.getBoundingClientRect());
      if (rect)
        discardOrigins.set(`g${gameNumber}:discard:${seat}:${nextDiscardCount - 1}`, {
          rect,
          concealed: removed.tileId === undefined,
        });
      tracks.set(seat, track);
      continue;
    }
    tracks.set(seat, track);
  }
}

export function handVisualTokens(
  seat: SeatId,
  fallback: readonly number[],
  revealed: boolean,
): HandVisualToken[] {
  return handTokensForPresentation(tracks.get(seat), seat, fallback, revealed);
}

export function handVisualAnimationState(): {
  tracks: ReadonlyMap<SeatId, HandVisualTrack>;
  discardOrigins: ReadonlyMap<string, { rect: DOMRect; concealed: boolean }>;
} {
  return { tracks: new Map(tracks), discardOrigins: new Map(discardOrigins) };
}

export function discardFlightOrigin(
  key: string,
): { rect: DOMRect; concealed: boolean } | undefined {
  return discardOrigins.get(key);
}
