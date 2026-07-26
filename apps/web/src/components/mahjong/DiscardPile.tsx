import type { SeatDirection } from "@/lib/seatLayout";
import type { TableLayoutMetrics } from "@/lib/desktopTablePreset";
import { Tile } from "./Tile";
import { TileClaimSlot } from "./TileClaimSlot";

export type DiscardEntry = {
  tile: number;
  claimedBy?: number;
  /** Direction (relative to the viewer) of the seat that claimed this discard — see TableView. */
  claimedByDirection?: SeatDirection;
  /** True for the single most recent discard on the table (view.lastDiscard). */
  justDiscarded?: boolean;
};

interface DiscardPileProps {
  /** This pile's own seat direction — TileClaimSlot's badge counter-rotates against the ambient Zone rotation for this direction so it always reads in true screen orientation, the same technique InfoSlot uses for its label. */
  direction: SeatDirection;
  discards: DiscardEntry[];
  metrics: TableLayoutMetrics;
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
  const { columns, rows } = metrics.discard;
  const totalRows = Math.max(rows, Math.ceil(discards.length / columns));

  return (
    <div
      className="flex h-full w-full min-h-0 min-w-0 flex-col"
      style={{ gap: `${metrics.tiles.tileGapPx}px` }}
    >
      {Array.from({ length: totalRows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex w-full min-w-0 items-center justify-center"
          style={{
            height: `${metrics.tiles.discardShortPct}%`,
            gap: `${metrics.tiles.tileGapPx}px`,
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
              <TileClaimSlot
                key={columnIndex}
                direction={direction}
                claimFromDirection={entry.claimedByDirection}
                aspectRatio={metrics.tiles.aspectRatio}
                claimTestId="discard-claim-icon"
                tileId={entry.tile}
                dimmed={entry.claimedBy !== undefined}
                justDiscarded={entry.justDiscarded}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
