import { useRef } from "react";
import { sortTilesForDisplay } from "@/features/mahjong/lib/mahjongTiles";
import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";
import type { TableLayoutConfig } from "@/features/mahjong/lib/tableLayoutConfig";
import { useSlotEntering } from "@/features/mahjong/lib/useSlotEntering";
import { ClaimFlipGhost } from "./ClaimFlipGhost";
import { TileClaimSlot } from "./TileClaimSlot";

export type Meld = {
  type: string;
  tiles: number[];
  from?: number;
  /** Direction (relative to the viewer) of the seat this meld's claimed tile came from — see TableView. Absent for anGang (self-made, no claim). */
  fromDirection?: SeatDirection;
  /** animationLedger key for this meld — see useSlotEntering, and useTablePresentation.ts's meldLedgerKey. */
  meldLedgerKey: string;
};

interface MeldGroupProps {
  /** This track's own seat direction — counter-rotates the source-arrow badge, same technique as DiscardPile. */
  direction: SeatDirection;
  melds: Meld[];
  /**
   * Percent of MeldGroup's own height every meld row (and thus every tile)
   * should be — precomputed by MeldSlot (see
   * components/mahjong/scenarios/desktopZoneComponents.tsx) from
   * meldTileHeight/meldHeight so nesting inside the meld row's own
   * percentage box still lands at the same absolute size. Every row gets the
   * same fixed percentage regardless of how many melds wrap onto their own
   * row, so extra rows simply add height rather than shrinking existing
   * ones — overflow-hidden above clips whatever doesn't fit instead.
   */
  tileHeight: number;
  config: TableLayoutConfig;
}

/**
 * Bottom-aligned, left-anchored, wraps whole melds onto a new row instead of
 * shrinking — tile size is a fixed percentage of the shared shell's own
 * height, never squeezed by a fixed column count.
 */
export function MeldGroup({ direction, melds, tileHeight, config }: MeldGroupProps) {
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
        const fromTileId = meld.fromDirection !== undefined ? meld.tiles[fromTileIndex] : undefined;
        // Only chi mixes three different kinds in claim order rather than rank order, so only it
        // needs re-sorting for display. Peng/gang tiles are all the same kind — keep the original
        // construction order as-is, which already has the claimed tile last (or second-to-last
        // for buGang); sorting those would just be a no-op dressed up as one.
        const sortedTiles = meld.type === "chi" ? sortTilesForDisplay(meld.tiles) : meld.tiles;
        return (
          <div
            key={meldIndex}
            className="flex"
            style={{ height: `${tileHeight}%`, gap: `${config.shared.tileGapPx}px` }}
          >
            {sortedTiles.map((tile) => {
              const isFromClaim = tile === fromTileId;
              return (
                <MeldClaimTile
                  key={tile}
                  direction={direction}
                  fromDirection={isFromClaim ? meld.fromDirection : undefined}
                  meldLedgerKey={meld.meldLedgerKey}
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
 * tile. `useSlotEntering` reads animationLedger's resolution for
 * `meldLedgerKey` exactly once at mount, so a ghost already in flight is
 * never unmounted mid-flight by an unrelated re-render.
 */
function MeldClaimTile({
  direction,
  fromDirection,
  meldLedgerKey,
  aspectRatio,
  tile,
}: {
  direction: SeatDirection;
  /** Set only for the tile that came from a claim (chi/peng/gang), at the render it was claimed — see MeldGroup's `isFromClaim`. */
  fromDirection: SeatDirection | undefined;
  meldLedgerKey: string;
  aspectRatio: number;
  tile: number;
}) {
  const { entering, ghost, onGhostComplete } = useSlotEntering(meldLedgerKey);
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
      {ghost && fromDirection !== undefined && (
        <ClaimFlipGhost
          tileId={tile}
          fromSelector={`[data-testid="table-area-${fromDirection}"] [data-tile-id="${tile}"]`}
          toRef={toRef}
          onAnimationComplete={onGhostComplete}
        />
      )}
    </>
  );
}
