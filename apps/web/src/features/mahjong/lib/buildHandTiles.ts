import { isCaishenTile, sortTilesForDisplay } from "@/features/mahjong/lib/mahjongTiles";
import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";

export interface BuildHandTilesInput {
  direction: SeatDirection;
  /** My own concealed hand (`view.hand`) — only meaningful for `direction === "bottom"`. */
  hand: readonly number[];
  /** `extras.justDrawn` — private, only set on my own view's just-drawn tile. */
  myJustDrawnTile: number | undefined;
  /** God-mode's real tiles for this opponent seat (see useTablePresentation's godView doc). */
  godHand: readonly number[] | undefined;
  /** This seat's public hand size (`data.handCount`), used for the redacted-opponent slot count. */
  handCount: number;
  /** This seat's public just-drew flag (`data.justDrawn`), used for non-bottom/non-god seats. */
  seatJustDrawn: boolean;
  highlightCaishen: boolean;
}

export interface BuildHandTilesResult {
  /** Slot values for `SeatContent.handTiles` — real TileIds where revealed, `0` filler and `-1`
   * gaps otherwise. See useTablePresentation's render-order comment for the slot layout. */
  handTiles: number[];
  /** Whether this seat's most recent draw should render in the pinned trailing slot. */
  drawnVisible: boolean;
  /** The god-mode real tile for this seat's pinned drawn slot, if any — reused by
   * useTablePresentation for `drawnSlotKey`, so it's returned instead of recomputed. */
  godDrawnTile: number | undefined;
}

/**
 * Builds one seat's `handTiles` slot array (see useTablePresentation.ts's render-order
 * comment: hangzhou's caishen tiles first, then the rest, then two fixed trailing slots —
 * an empty gap and the pinned just-drawn tile). Pure function of the seat's own data; reads
 * no store/context.
 */
export function buildHandTiles({
  direction,
  hand,
  myJustDrawnTile,
  godHand,
  handCount,
  seatJustDrawn,
  highlightCaishen,
}: BuildHandTilesInput): BuildHandTilesResult {
  const drawnVisible = direction === "bottom" ? myJustDrawnTile !== undefined : seatJustDrawn;

  const restOfHand =
    myJustDrawnTile !== undefined ? hand.filter((tile) => tile !== myJustDrawnTile) : hand;
  const caishenTiles = highlightCaishen ? restOfHand.filter(isCaishenTile) : [];
  const nonCaishenTiles = highlightCaishen
    ? restOfHand.filter((tile) => !isCaishenTile(tile))
    : restOfHand;

  const godDrawnTile = godHand && drawnVisible ? godHand[godHand.length - 1] : undefined;
  const godRestOfHand = godHand ? (godDrawnTile !== undefined ? godHand.slice(0, -1) : godHand) : [];
  const godCaishenTiles = highlightCaishen ? godRestOfHand.filter(isCaishenTile) : [];
  const godNonCaishenTiles = highlightCaishen
    ? godRestOfHand.filter((tile) => !isCaishenTile(tile))
    : godRestOfHand;

  const handTiles =
    direction === "bottom"
      ? [
          ...sortTilesForDisplay(caishenTiles),
          ...(caishenTiles.length > 0 ? [-1] : []),
          ...sortTilesForDisplay(nonCaishenTiles),
          -1,
          myJustDrawnTile ?? -1,
        ]
      : godHand
        ? [
            ...sortTilesForDisplay(godCaishenTiles),
            ...(godCaishenTiles.length > 0 ? [-1] : []),
            ...sortTilesForDisplay(godNonCaishenTiles),
            -1,
            godDrawnTile ?? -1,
          ]
        : [
            ...Array<number>(drawnVisible ? handCount - 1 : handCount).fill(0),
            -1,
            drawnVisible ? 0 : -1,
          ];

  return { handTiles, drawnVisible, godDrawnTile };
}
