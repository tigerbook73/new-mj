import { fitTileGrid } from "@/lib/tableGeometry";
import { SEAT_ROTATION, type SeatDirection } from "@/lib/seatLayout";
import type { TableLayoutConfig } from "@/lib/tableLayoutLab";
import { DIRECTION_ARROW_ICON } from "./directionArrowIcon";
import { Tile } from "./Tile";

export type DiscardEntry = {
  tile: number;
  claimedBy?: number;
  /** Direction (relative to the viewer) of the seat that claimed this discard — see TableView. */
  claimedByDirection?: SeatDirection;
  /** True for the single most recent discard on the table (view.lastDiscard). */
  justDiscarded?: boolean;
};

interface DiscardPileProps {
  /** This pile's own seat direction — the claim badge counter-rotates against DirectionalSurface's ambient rotation for this direction so it always reads in true screen orientation, the same technique MeldInfoTrack uses for its info label. */
  direction: SeatDirection;
  discards: DiscardEntry[];
  /** Real measured content-box pixels of the discard region (see fitTileGrid). */
  containerWidthPx: number;
  containerHeightPx: number;
  config: TableLayoutConfig;
}

/**
 * claimedBy'd entries stay in the pile (tombstone — see DiscardEntry docs), just dimmed.
 *
 * Fixed grid, not flex-wrap: every slot (including not-yet-discarded ones, up to
 * `columns * rows`) is reserved up front, row-major left-to-right/top-to-bottom from a fixed
 * top-left origin. A flex-wrap layout re-centers its whole content block every time a row is
 * added, which visibly nudges every earlier tile — a fixed grid's footprint is constant
 * (`columns * rows` slots) until discards actually overflow it, so already-placed tiles never
 * move once drawn.
 */
export function DiscardPile({
  direction,
  discards,
  containerWidthPx,
  containerHeightPx,
  config,
}: DiscardPileProps) {
  const { columns, rows } = config.discard;
  const { tileWidthPx, tileHeightPx } = fitTileGrid(containerWidthPx, containerHeightPx, {
    columns,
    rows,
    heightPct: config.tiles.discardShortPct,
    aspectRatio: config.tiles.aspectRatio,
    tileGapPx: config.tiles.tileGapPx,
  });
  // Extra rows only ever append past the configured minimum — never fewer — so a pile that's
  // still within capacity always renders the same slot count.
  const totalRows = Math.max(rows, Math.ceil(discards.length / columns));

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${columns}, ${tileWidthPx}px)`,
        gridAutoRows: `${tileHeightPx}px`,
        gap: `${config.tiles.tileGapPx}px`,
      }}
    >
      {Array.from({ length: totalRows * columns }, (_, index) => {
        const entry = discards[index];
        if (!entry) {
          return (
            <div
              key={`empty-${index}`}
              data-testid="discard-slot-empty"
              style={{ width: tileWidthPx, height: tileHeightPx }}
            />
          );
        }
        const ClaimIcon = entry.claimedByDirection
          ? DIRECTION_ARROW_ICON[entry.claimedByDirection]
          : undefined;
        return (
          <div
            key={`${entry.tile}-${index}`}
            className="relative"
            style={{ width: tileWidthPx, height: tileHeightPx }}
          >
            <Tile
              tileId={entry.tile}
              widthPx={tileWidthPx}
              heightPx={tileHeightPx}
              dimmed={entry.claimedBy !== undefined}
              justDiscarded={entry.justDiscarded}
            />
            {ClaimIcon && (
              // Centered (not corner-anchored) so DirectionalSurface's rotation never pushes it
              // outside the tile footprint; counter-rotated so the arrow itself always points in
              // the true on-screen direction regardless of this pile's ambient rotation.
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                style={{ transform: `rotate(${-SEAT_ROTATION[direction]}deg)` }}
              >
                <ClaimIcon
                  data-testid="discard-claim-icon"
                  className="rounded-full bg-background text-foreground ring-1 ring-border"
                  style={{ width: tileWidthPx * 0.55, height: tileWidthPx * 0.55 }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
