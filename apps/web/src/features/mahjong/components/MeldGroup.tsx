import { useRef, useState } from "react";
import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";
import type { TableLayoutConfig } from "@/features/mahjong/lib/tableLayoutConfig";
import { ClaimFlipGhost } from "./ClaimFlipGhost";
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
  /** See SeatContent.meldEntering (components/mahjong/TableBoard.tsx). */
  entering: boolean;
}

/**
 * Bottom-aligned, left-anchored, wraps whole melds onto a new row instead of
 * shrinking — tile size is a fixed percentage of the shared shell's own
 * height, never squeezed by a fixed column count.
 */
export function MeldGroup({ direction, melds, tileHeightPct, config, entering }: MeldGroupProps) {
  if (melds.length === 0) return null;

  return (
    <div
      className="flex h-full w-full flex-wrap content-end items-end justify-start overflow-hidden"
      style={{ gap: `${config.shared.tileGapPx * 2}px` }}
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
            style={{ height: `${tileHeightPct}%`, gap: `${config.shared.tileGapPx}px` }}
          >
            {meld.tiles.map((tile, tileIndex) => {
              const isFromClaim = tileIndex === fromTileIndex && meld.fromDirection !== undefined;
              return (
                <MeldClaimTile
                  key={`${tile}-${tileIndex}`}
                  direction={direction}
                  fromDirection={isFromClaim ? meld.fromDirection : undefined}
                  entering={entering}
                  aspectRatio={config.shared.aspectRatio}
                  tile={tile}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Owns the per-tile hook state a plain `.map()` callback can't (rules of
 * hooks) — specifically, whether to mount a `ClaimFlipGhost` alongside this
 * tile. Captured once via `useState` rather than read live from `entering`:
 * `entering` (== canAnimateEntries) is only true for the single render right
 * after a live snapshot lands (see useIsIncrementalSnapshot), so deciding
 * "should this tile get a ghost" on every render would unmount the ghost
 * mid-flight the moment any unrelated re-render happens to land while it's
 * still playing.
 */
function MeldClaimTile({
  direction,
  fromDirection,
  entering,
  aspectRatio,
  tile,
}: {
  direction: SeatDirection;
  /** Set only for the tile that came from a claim (chi/peng/gang), at the render it was claimed — see MeldGroup's `isFromClaim`. */
  fromDirection: SeatDirection | undefined;
  entering: boolean;
  aspectRatio: number;
  tile: number;
}) {
  const [shouldGhost] = useState(fromDirection !== undefined && entering);
  const toRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={toRef} className="h-full">
        <TileClaimSlot
          direction={direction}
          claimFromDirection={fromDirection}
          aspectRatio={aspectRatio}
          claimTestId="meld-claim-icon"
          tileId={tile}
          entering={entering}
        />
      </div>
      {shouldGhost && fromDirection !== undefined && (
        <ClaimFlipGhost
          tileId={tile}
          fromSelector={`[data-testid="table-area-${fromDirection}"] [data-tile-id="${tile}"]`}
          toRef={toRef}
        />
      )}
    </>
  );
}
