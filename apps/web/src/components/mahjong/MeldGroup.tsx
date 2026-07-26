import type { SeatDirection } from "@/lib/seatLayout";
import type { TableLayoutConfig } from "@/lib/tableLayoutLab";
import { TileClaimSlot } from "./TileClaimSlot";

export type Meld = {
  type: string;
  tiles: number[];
  from?: number;
  /** Direction (relative to the viewer) of the seat this meld's claimed tile came from — see TableView. Absent for anGang (self-made, no claim). */
  fromDirection?: SeatDirection;
};

interface MeldGroupProps {
  /** This track's own seat direction — counter-rotates the source-arrow badge, same technique as DiscardPile. */
  direction: SeatDirection;
  melds: Meld[];
  /**
   * Percent of MeldGroup's own height every meld row (and thus every tile)
   * should be — precomputed by MeldSlot (see
   * components/mahjong/scenarios/desktopZoneComponents.tsx) from
   * meldTileHeightPct/meldHeightPct so nesting inside the meld row's own
   * percentage box still lands at the same absolute size. Every row gets the
   * same fixed percentage regardless of how many melds wrap onto their own
   * row, so extra rows simply add height rather than shrinking existing
   * ones — overflow-hidden above clips whatever doesn't fit instead.
   */
  tileHeightPct: number;
  config: TableLayoutConfig;
}

/**
 * Bottom-aligned, left-anchored, wraps whole melds onto a new row instead of
 * shrinking — tile size is a fixed percentage of the shared shell's own
 * height, never squeezed by a fixed column count.
 */
export function MeldGroup({ direction, melds, tileHeightPct, config }: MeldGroupProps) {
  if (melds.length === 0) return null;

  return (
    <div
      className="flex h-full w-full flex-wrap content-end items-end justify-start overflow-hidden"
      style={{ gap: `${config.tiles.tileGapPx * 2}px` }}
    >
      {melds.map((meld, meldIndex) => {
        // The claimed tile is always the last one appended, except buGang: the self-drawn 4th
        // tile is pushed after it, pushing the claimed tile to the second-to-last slot — see
        // claims.ts's `[...useTiles, discard.tile]` and state-machine.ts's applyBuGang.
        const fromTileIndex =
          meld.type === "buGang" ? meld.tiles.length - 2 : meld.tiles.length - 1;
        return (
          <div
            key={meldIndex}
            className="flex"
            style={{ height: `${tileHeightPct}%`, gap: `${config.tiles.tileGapPx}px` }}
          >
            {meld.tiles.map((tile, tileIndex) => (
              <TileClaimSlot
                key={`${tile}-${tileIndex}`}
                direction={direction}
                claimFromDirection={tileIndex === fromTileIndex ? meld.fromDirection : undefined}
                aspectRatio={config.tiles.aspectRatio}
                claimTestId="meld-claim-icon"
                tileId={tile}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
