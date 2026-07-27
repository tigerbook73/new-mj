import { useRef, useState } from "react";
import type { SeatDirection } from "@/lib/seatLayout";
import type { TableLayoutConfig } from "@/lib/tableLayoutLab";
import { DiscardFlipGhost } from "./DiscardFlipGhost";
import { Tile } from "./Tile";
import { TileClaimSlot } from "./TileClaimSlot";

export type DiscardEntry = {
  tile: number;
  claimedBy?: number;
  /** Direction (relative to the viewer) of the seat that claimed this discard — see TableView. */
  claimedByDirection?: SeatDirection;
  /** True for the single most recent discard on the table (view.lastDiscard). */
  justDiscarded?: boolean;
  /** True when justDiscarded should also play its one-shot entry animation — see useIsIncrementalSnapshot. */
  enterAnimation?: boolean;
  /**
   * This tile's own hand-side rect, captured at click time (see HandRow.tsx's
   * `captureTileRect`) — only ever present for my own discards, and only for
   * the single render where this entry is genuinely new. Drives
   * DiscardFlipGhost below; absent (e.g. an opponent's discard, or a page
   * reload) just means this entry gets the plain grow-in entry animation with
   * no flight.
   */
  flightOrigin?: DOMRect;
};

interface DiscardPileProps {
  /** This pile's own seat direction — TileClaimSlot's badge counter-rotates against the ambient Zone rotation for this direction so it always reads in true screen orientation, the same technique InfoSlot uses for its label. */
  direction: SeatDirection;
  discards: DiscardEntry[];
  metrics: TableLayoutConfig;
}

/**
 * claimedBy'd entries stay in the pile (tombstone — see DiscardEntry docs), just dimmed.
 *
 * Two-level flex, not a measured grid: rows stack top-to-bottom (growing downward once
 * discards exceed the configured row count — never shrinking tiles to force a fit), each row
 * itself lays out left-to-right and centers its own content. The last row is padded with
 * invalid (negative) TileIds up to `columns` so its tiles stay column-aligned with the rows
 * above instead of collapsing toward one side — Tile.tsx renders those as invisible
 * placeholders that still occupy a slot. Row height is a fixed percentage of the pile's own
 * container height; each tile fills 100% of its row's height and derives its own width from
 * the aspect ratio, so none of this needs a measured container size.
 */
export function DiscardPile({ direction, discards, metrics }: DiscardPileProps) {
  const { columns, rows } = metrics.discardZone;
  const totalRows = Math.max(rows, Math.ceil(discards.length / columns));

  return (
    <div
      className="flex h-full w-full min-h-0 min-w-0 flex-col pt-2"
      style={{ gap: `${metrics.shared.tileGapPx}px` }}
    >
      {Array.from({ length: totalRows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex w-full min-w-0 items-center justify-center"
          style={{
            height: `${metrics.discardZone.discardShort}%`,
            gap: `${metrics.shared.tileGapPx}px`,
          }}
        >
          {Array.from({ length: columns }, (_, columnIndex) => {
            const entry = discards[rowIndex * columns + columnIndex];
            if (!entry) {
              return (
                <Tile key={columnIndex} testId="discard-slot-empty" tileId={-1} heightPx="100%" />
              );
            }
            return (
              <DiscardTileSlot
                key={columnIndex}
                direction={direction}
                entry={entry}
                aspectRatio={metrics.shared.aspectRatio}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Owns the per-entry hook state a plain `.map()` callback can't (rules of
 * hooks) — specifically, whether to mount a `DiscardFlipGhost` alongside this
 * slot's real tile. `ghostOrigin` is captured once via `useState` (not read
 * live from `entry.flightOrigin` on every render), same reasoning as
 * MeldGroup.tsx's `MeldClaimTile`: TableView clears its own pending-origin
 * state once the next snapshot arrives (see TableView.tsx), which would flip
 * `entry.flightOrigin` back to `undefined` on the very next render — reading
 * it live here would yank the ghost off mid-flight for a reason that has
 * nothing to do with the flight itself actually finishing.
 */
function DiscardTileSlot({
  direction,
  entry,
  aspectRatio,
}: {
  direction: SeatDirection;
  entry: DiscardEntry;
  aspectRatio: number;
}) {
  const [ghostOrigin] = useState<DOMRect | null>(() =>
    entry.enterAnimation && entry.flightOrigin ? entry.flightOrigin : null,
  );
  const toRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={toRef} className="h-full">
        <TileClaimSlot
          direction={direction}
          claimFromDirection={entry.claimedByDirection}
          aspectRatio={aspectRatio}
          claimTestId="discard-claim-icon"
          tileId={entry.tile}
          dimmed={entry.claimedBy !== undefined}
          justDiscarded={entry.justDiscarded}
          entering={entry.enterAnimation}
        />
      </div>
      {ghostOrigin && <DiscardFlipGhost tileId={entry.tile} fromRect={ghostOrigin} toRef={toRef} />}
    </>
  );
}
