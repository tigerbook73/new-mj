import { SEAT_ROTATION, type SeatDirection } from "@/features/mahjong/lib/seatLayout";
import { DIRECTION_ARROW_ICON } from "./directionArrowIcon";
import { Tile, type TileProps } from "./Tile";

interface TileClaimSlotProps extends Omit<TileProps, "widthPx" | "heightPx"> {
  /** This slot's own on-screen seat direction — the badge counter-rotates against the ambient Zone rotation for this direction so its arrow always points the true on-screen way, regardless of how this slot's own Zone is rotated. */
  direction: SeatDirection;
  /** Direction the claim came from; omit to render the tile with no badge at all. */
  claimFromDirection?: SeatDirection | undefined;
  /** Tile height / tile width — same box every tile in this track shares. */
  aspectRatio: number;
  claimTestId?: string;
}

/**
 * A tile that fills its own aspect-ratio box (height comes from the row it
 * sits in; width derives from `aspectRatio`) with an optional claim-direction
 * badge overlay, centered so the ambient rotation never pushes it outside the
 * tile's own footprint. Shared by DiscardPile and MeldGroup, the two tracks
 * that show this badge.
 */
export function TileClaimSlot({
  direction,
  claimFromDirection,
  aspectRatio,
  claimTestId,
  ...tileProps
}: TileClaimSlotProps) {
  const ClaimIcon = claimFromDirection ? DIRECTION_ARROW_ICON[claimFromDirection] : undefined;
  return (
    <div className="relative h-full" style={{ aspectRatio: `1 / ${aspectRatio}` }}>
      <Tile {...tileProps} heightPx="100%" />
      {ClaimIcon && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ transform: `rotate(${-SEAT_ROTATION[direction]}deg)` }}
        >
          {/*
           * lucide-react icons render an <svg width="24" height="24"> — giving
           * only the icon itself a CSS width and relying on aspect-ratio for
           * height does NOT override that intrinsic height (verified: computed
           * height stays a fixed 24px). The wrapper below is a plain div with
           * no intrinsic size of its own, so its aspect-ratio is honored
           * reliably; the icon just fills it via h-full w-full, same
           * technique as TurnIndicator's <Icon className="h-full w-full">.
           */}
          <div
            className="rounded-full bg-background text-foreground ring-1 ring-border"
            style={{ width: "55%", aspectRatio: 1 }}
          >
            <ClaimIcon data-testid={claimTestId} className="h-full w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
