import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/** Height / width of a real mahjong tile face — mirrors layouts/desktop.table-config.ts's `shared.aspectRatio`. */
export const DEFAULT_TILE_ASPECT_RATIO = 1.333;

export interface TileSlotProps {
  /** A negative TileId (see Tile.tsx) — renders an empty, unrendered box that still occupies its layout slot. */
  isPlaceholder: boolean;
  /** Pixel (or CSS percentage) box — give both for an exact box, or only one and let `aspect-ratio` derive the other. */
  width?: number | string | undefined;
  height?: number | string | undefined;
  className?: string | undefined;
  /** Only meaningful for the placeholder branch — the real-tile branch's testid lives on TileMotion instead, since that's the node motion actually writes transforms to (see Tile.tsx). */
  testId?: string | undefined;
  children?: ReactNode;
}

/**
 * The outermost, constant layer of Tile.tsx's three-layer split: pure
 * sizing, present whether or not this slot holds a real tile. `shrink-0`
 * lives here (not on TileFace) because this is the node that actually
 * participates in a parent flex row (HandRow/DiscardPile/MeldGroup all lay
 * tiles out with `flex`).
 */
export function TileSlot({
  isPlaceholder,
  width,
  height,
  className,
  testId,
  children,
}: TileSlotProps) {
  const hasWidth = width !== undefined;
  const hasHeight = height !== undefined;
  const aspectRatio = hasWidth === hasHeight ? undefined : `1 / ${DEFAULT_TILE_ASPECT_RATIO}`;

  if (isPlaceholder) {
    return (
      <div
        data-testid={testId}
        data-empty
        aria-hidden="true"
        className={cn("shrink-0", className)}
        style={{ width, height, aspectRatio }}
      />
    );
  }

  return (
    <div
      className={cn("shrink-0", className)}
      style={{
        width: hasWidth ? width : !hasHeight ? 44 : undefined,
        height: hasHeight ? height : !hasWidth ? 59 : undefined,
        // Only relevant when exactly one side was omitted — that's what lets
        // the browser derive it. Both given (the real board's usual case) or
        // neither given (bare defaults above) both fully determine the box
        // already, so aspect-ratio has nothing left to do.
        aspectRatio,
      }}
    >
      {children}
    </div>
  );
}
