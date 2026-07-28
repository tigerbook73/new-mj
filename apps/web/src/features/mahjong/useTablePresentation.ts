import type { PlayerViewBase, SeatId } from "@new-mj/protocol";
import type { DiscardEntry } from "@/features/mahjong/components/DiscardPile";
import type { Meld } from "@/features/mahjong/components/MeldGroup";
import type { SeatContent } from "@/features/mahjong/components/TableBoard";
import { sortTilesForDisplay } from "@/features/mahjong/lib/mahjongTiles";
import {
  directionOf,
  seatAt,
  SEAT_DIRECTIONS,
  type SeatDirection,
} from "@/features/mahjong/lib/seatLayout";

type JunkSeatExtra = {
  handCount: number;
  melds: Meld[];
  discards: DiscardEntry[];
  /** Public: this seat just drew and hasn't acted yet — see docs/variants/junk.md §7. */
  justDrawn: boolean;
};

export type GameResultLike =
  | { type: "draw"; scoreDeltas: [number, number, number, number] }
  | {
      type: "win";
      winner: number;
      winners: number[];
      winType: "zimo" | "ron";
      from?: number;
      scoreDeltas: [number, number, number, number];
    };

export type TableViewExtras = {
  phase?: string;
  myActionOptions?: Record<string, unknown>[];
  seats?: JunkSeatExtra[];
  /** Private: only present when it's my own seat's just-drawn tile. */
  justDrawn?: number;
  /** Public: the single most recent discard on the table — see docs/variants/junk.md §7. */
  lastDiscard?: { seat: SeatId; tile: number };
  /** Public: present once `phase==="finished"` — drives RoundEndOverlay below. */
  result?: GameResultLike;
};

type PlayerInfo = { nickname?: string } | null;

const EMPTY_SEAT: JunkSeatExtra = { handCount: 0, melds: [], discards: [], justDrawn: false };

/**
 * Converts the ruleset-private PlayerView fields into the presentation props used by TableBoard.
 * It deliberately reads only the server-provided view; it neither derives legal actions nor
 * mutates state from command acknowledgements.
 */
export function useTablePresentation({
  view,
  players,
  onDiscard,
  canAnimateEntries = false,
  pendingDiscardOrigin,
}: {
  view: PlayerViewBase | null;
  players: readonly PlayerInfo[] | undefined;
  onDiscard: (tile: number, originRect?: DOMRect) => void;
  /** Gates one-shot entry animations (e.g. a freshly discarded tile sliding into the pile) — see useIsIncrementalSnapshot and usePrefersReducedMotion. */
  canAnimateEntries?: boolean;
  /** See TableView.tsx — a click-time rect capture for the discard-flying-out ghost, matched against the newly-landed discard entry by TileId. */
  pendingDiscardOrigin?: { tile: number; rect: DOMRect } | null;
}) {
  if (!view) {
    return undefined;
  }
  const extras = view as unknown as TableViewExtras;
  const isMyTurn = view.currentSeat === view.seat && extras.phase === "playing";
  const actionOptions = extras.myActionOptions ?? [];
  // "draw" is core-gated but server-auto-submitted (docs/contracts/session-mechanics.md
  // "摸牌延时代提交") — it must never render as a clickable dock affordance.
  const hasDockActions = actionOptions.some(
    (action) => action.type !== "discard" && action.type !== "draw",
  );
  const seatData = (seat: SeatId): JunkSeatExtra => extras.seats?.[seat] ?? EMPTY_SEAT;

  const seats = Object.fromEntries(
    SEAT_DIRECTIONS.map((direction) => {
      const seat = seatAt(view.seat, direction);
      const data = seatData(seat);
      const player = players?.[seat];
      const drawnVisible = direction === "bottom" ? extras.justDrawn !== undefined : data.justDrawn;
      // Render order: the rest of the concealed hand, then always exactly two trailing
      // slots — an empty gap, then the just-drawn tile (or another empty slot when nobody
      // has just drawn) — so the pinned position never shifts the row's total width.
      // Opponents have no real TileIds to show, so their "rest" slots are meaningless
      // filler (0) that HandRow never reads as an id because `revealed` is false.
      const handTiles: number[] =
        direction === "bottom"
          ? [
              ...sortTilesForDisplay(
                extras.justDrawn !== undefined
                  ? view.hand.filter((tile) => tile !== extras.justDrawn)
                  : view.hand,
              ),
              -1,
              extras.justDrawn ?? -1,
            ]
          : [
              ...Array<number>(drawnVisible ? data.handCount - 1 : data.handCount).fill(0),
              -1,
              drawnVisible ? 0 : -1,
            ];
      // A real TileId is globally unique (architecture iron rule 4), so keying my
      // own drawn slot by it already changes on every new draw. Opponents never
      // expose a real TileId here (public events can't reveal concealed hands —
      // architecture iron rule 2); their handCount toggles between two values
      // across a draw/discard cycle, which is enough to tell "this draw" from
      // "last draw" apart across the one render transition that matters, even
      // though the same numeric value recurs turn after turn.
      const drawnSlotKey =
        direction === "bottom"
          ? extras.justDrawn !== undefined
            ? `own-${extras.justDrawn}`
            : "none"
          : drawnVisible
            ? `opp-${seat}-${data.handCount}`
            : "none";
      const content: SeatContent = {
        melds: data.melds.map((meld) => ({
          ...meld,
          ...(meld.from !== undefined
            ? { fromDirection: directionOf(view.seat, meld.from as SeatId) }
            : {}),
        })),
        handTiles,
        revealed: direction === "bottom",
        info: player?.nickname ?? `Seat ${seat + 1}`,
        drawnSlotKey,
        drawnSlotEntering: drawnVisible && canAnimateEntries,
        meldEntering: canAnimateEntries,
        ...(direction === "bottom" ? { interactive: isMyTurn, onDiscard } : {}),
      };
      return [direction, content];
    }),
  ) as Record<SeatDirection, SeatContent>;

  const discards = Object.fromEntries(
    SEAT_DIRECTIONS.map((direction) => {
      const seat = seatAt(view.seat, direction);
      const entries = seatData(seat).discards.map((entry) => {
        const justDiscarded =
          extras.lastDiscard?.seat === seat && extras.lastDiscard.tile === entry.tile;
        return {
          ...entry,
          claimedByDirection:
            entry.claimedBy !== undefined
              ? directionOf(view.seat, entry.claimedBy as SeatId)
              : undefined,
          justDiscarded,
          enterAnimation: justDiscarded && canAnimateEntries,
          flightOrigin:
            pendingDiscardOrigin?.tile === entry.tile ? pendingDiscardOrigin.rect : undefined,
        };
      });
      return [direction, entries];
    }),
  ) as Record<SeatDirection, DiscardEntry[]>;

  const currentDirection = SEAT_DIRECTIONS.find(
    (direction) => seatAt(view.seat, direction) === view.currentSeat,
  );

  return { actionOptions, currentDirection, discards, extras, hasDockActions, seats };
}
