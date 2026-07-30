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
 * index (never by tile value, so it can't leak a concealed TileId and stays
 * collision-free across rulesets that reuse TileKind instead of TileId).
 * Purely a diff: it never reads or produces anything that gates what data
 * renders, only what decorative animation, if any, plays alongside it.
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
