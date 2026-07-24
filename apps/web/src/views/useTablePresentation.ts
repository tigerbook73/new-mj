import type { PlayerViewBase, SeatId } from "@new-mj/protocol";
import type { DiscardEntry } from "@/components/mahjong/DiscardPile";
import type { Meld } from "@/components/mahjong/MeldGroup";
import type { SeatContent } from "@/components/mahjong/TableBoard";
import { directionOf, seatAt, SEAT_DIRECTIONS, type SeatDirection } from "@/lib/seatLayout";

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
}: {
  view: PlayerViewBase | null;
  players: readonly PlayerInfo[] | undefined;
  onDiscard: (tile: number) => void;
}) {
  if (!view) {
    return undefined;
  }
  const extras = view as unknown as TableViewExtras;
  const isMyTurn = view.currentSeat === view.seat && extras.phase === "playing";
  const actionOptions = extras.myActionOptions ?? [];
  const hasDockActions = actionOptions.some((action) => action.type !== "discard");
  const seatData = (seat: SeatId): JunkSeatExtra => extras.seats?.[seat] ?? EMPTY_SEAT;

  const seats = Object.fromEntries(
    SEAT_DIRECTIONS.map((direction) => {
      const seat = seatAt(view.seat, direction);
      const data = seatData(seat);
      const player = players?.[seat];
      const drawnVisible = direction === "bottom" ? extras.justDrawn !== undefined : data.justDrawn;
      const content: SeatContent = {
        melds: data.melds.map((meld) => ({
          ...meld,
          ...(meld.from !== undefined
            ? { fromDirection: directionOf(view.seat, meld.from as SeatId) }
            : {}),
        })),
        // The just-drawn tile is pinned separately below — drop it from the main row/count so
        // it isn't shown (or counted) twice.
        handCount: drawnVisible ? data.handCount - 1 : data.handCount,
        info: player?.nickname ?? `Seat ${seat + 1}`,
        justDrawn:
          direction === "bottom"
            ? {
                visible: extras.justDrawn !== undefined,
                ...(extras.justDrawn !== undefined ? { tileId: extras.justDrawn } : {}),
                ...(extras.justDrawn !== undefined && isMyTurn
                  ? { onClick: () => onDiscard(extras.justDrawn!) }
                  : {}),
              }
            : { visible: data.justDrawn },
        ...(direction === "bottom"
          ? {
              hand:
                extras.justDrawn !== undefined
                  ? view.hand.filter((tile) => tile !== extras.justDrawn)
                  : view.hand,
              interactive: isMyTurn,
              onDiscard,
            }
          : {}),
      };
      return [direction, content];
    }),
  ) as Record<SeatDirection, SeatContent>;

  const discards = Object.fromEntries(
    SEAT_DIRECTIONS.map((direction) => {
      const seat = seatAt(view.seat, direction);
      const entries = seatData(seat).discards.map((entry) => ({
        ...entry,
        claimedByDirection:
          entry.claimedBy !== undefined
            ? directionOf(view.seat, entry.claimedBy as SeatId)
            : undefined,
        justDiscarded: extras.lastDiscard?.seat === seat && extras.lastDiscard.tile === entry.tile,
      }));
      return [direction, entries];
    }),
  ) as Record<SeatDirection, DiscardEntry[]>;

  const currentDirection = SEAT_DIRECTIONS.find(
    (direction) => seatAt(view.seat, direction) === view.currentSeat,
  );

  return { actionOptions, currentDirection, discards, extras, hasDockActions, seats };
}
