import type { PlayerViewBase, SeatId } from "@new-mj/protocol";

export type SlotCategory = "draw" | "decorative";

export type SlotEvent = {
  key: string;
  category: SlotCategory;
  /** Own-seat events, and meld events where the claimed tile came from my own discard. */
  critical: boolean;
};

type MeldSlice = { tiles: unknown[]; from?: number };

type SeatSlice = {
  justDrawn?: boolean;
  discards?: unknown[];
  melds?: MeldSlice[];
};

/**
 * Ruleset-private fields read by convention (architecture iron rule 6 — web
 * never imports @new-mj/core types), the same subset TableViewExtras already
 * reads in useTablePresentation.ts. Bloodbattle has none of these fields, so
 * every comparison below naturally produces no events for it.
 */
type ViewSlice = {
  /** Private: only present on the view of the seat that just drew. */
  justDrawn?: number;
  seats?: SeatSlice[];
};

const SEATS: readonly SeatId[] = [0, 1, 2, 3];

/**
 * Diffs two consecutive PlayerView snapshots into the set of slots that
 * changed since `prev` — draws, discards, melds — keyed by seat + array
 * index, never by tile value (see docs/architecture/frontend-layout.md §5
 * for why). Purely a diff: it never reads or produces anything that gates
 * what data renders, only what decorative animation, if any, plays
 * alongside it.
 */
export function diffPlayerView(
  prev: PlayerViewBase | null,
  next: PlayerViewBase,
  mySeat: SeatId,
): SlotEvent[] {
  if (prev === null) return [];

  const prevExtras = prev as unknown as ViewSlice;
  const nextExtras = next as unknown as ViewSlice;
  const events: SlotEvent[] = [];

  if (nextExtras.justDrawn !== undefined && nextExtras.justDrawn !== prevExtras.justDrawn) {
    events.push({ key: `draw:own:${mySeat}`, category: "draw", critical: true });
  }

  for (const seat of SEATS) {
    if (seat === mySeat) continue;
    const wasDrawn = prevExtras.seats?.[seat]?.justDrawn === true;
    const isDrawn = nextExtras.seats?.[seat]?.justDrawn === true;
    if (isDrawn && !wasDrawn) {
      events.push({ key: `draw:opp:${seat}`, category: "draw", critical: false });
    }
  }

  for (const seat of SEATS) {
    const prevCount = prevExtras.seats?.[seat]?.discards?.length ?? 0;
    const nextDiscards = nextExtras.seats?.[seat]?.discards ?? [];
    for (let index = prevCount; index < nextDiscards.length; index++) {
      events.push({
        key: `discard:${seat}:${index}`,
        category: "decorative",
        critical: seat === mySeat,
      });
    }
  }

  for (const seat of SEATS) {
    const prevMelds = prevExtras.seats?.[seat]?.melds ?? [];
    const nextMelds = nextExtras.seats?.[seat]?.melds ?? [];
    for (let index = 0; index < nextMelds.length; index++) {
      const nextMeld = nextMelds[index]!;
      const prevMeld = prevMelds[index];
      if (prevMeld !== undefined && prevMeld.tiles.length === nextMeld.tiles.length) continue;
      events.push({
        key: `meld:${seat}:${index}:${nextMeld.tiles.length}`,
        category: "decorative",
        critical: seat === mySeat || nextMeld.from === mySeat,
      });
    }
  }

  return events;
}

/**
 * The single TileId that left my own concealed hand between `prev` and
 * `next`, if this pair of snapshots looks like exactly one plain discard
 * (hand shrank by exactly one tile) — `undefined` for anything else (a draw,
 * a claim pulling several tiles out at once, or no change), so callers never
 * have to guess which of several removed tiles was the discarded one.
 * `PlayerViewBase.hand` is always the requesting seat's own hand regardless
 * of ruleset, so this needs no seat/ruleset-specific field access — unlike
 * diffPlayerView's discard/meld diffs, which do read ruleset-private fields.
 */
export function soleDiscardedTile(prev: PlayerViewBase, next: PlayerViewBase): number | undefined {
  if (next.hand.length !== prev.hand.length - 1) return undefined;
  const nextHand = new Set(next.hand);
  const removed = prev.hand.filter((tile) => !nextHand.has(tile));
  return removed.length === 1 ? removed[0] : undefined;
}
