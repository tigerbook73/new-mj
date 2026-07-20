import { SEAT_ROTATION, type SeatDirection } from "@/lib/seatLayout";
import type { TableLayoutConfig } from "@/lib/tableLayoutLab";
import { DIRECTION_ARROW_ICON } from "./directionArrowIcon";
import { Tile } from "./Tile";

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
  /** Precomputed by the shared MeldInfoTrack shell (see components/mahjong/MeldInfoTrack.tsx). */
  tileWidthPx: number;
  tileHeightPx: number;
  config: TableLayoutConfig;
}

/**
 * Bottom-aligned, left-anchored, wraps whole melds onto a new row instead of
 * shrinking — tile size is driven purely by the shared shell's sizing, never
 * squeezed by a fixed column count.
 */
export function MeldGroup({ direction, melds, tileWidthPx, tileHeightPx, config }: MeldGroupProps) {
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
        const ClaimIcon = meld.fromDirection ? DIRECTION_ARROW_ICON[meld.fromDirection] : undefined;
        return (
          <div key={meldIndex} className="flex" style={{ gap: `${config.tiles.tileGapPx}px` }}>
            {meld.tiles.map((tile, tileIndex) => (
              <div
                key={`${tile}-${tileIndex}`}
                className="relative"
                style={{ width: tileWidthPx, height: tileHeightPx }}
              >
                <Tile tileId={tile} widthPx={tileWidthPx} heightPx={tileHeightPx} />
                {ClaimIcon && tileIndex === fromTileIndex && (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    style={{ transform: `rotate(${-SEAT_ROTATION[direction]}deg)` }}
                  >
                    <ClaimIcon
                      data-testid="meld-claim-icon"
                      className="rounded-full bg-background text-foreground ring-1 ring-border"
                      style={{ width: tileWidthPx * 0.55, height: tileWidthPx * 0.55 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
