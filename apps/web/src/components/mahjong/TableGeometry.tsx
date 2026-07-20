import type { ReactNode } from "react";
import { SEAT_ROTATION, type SeatDirection } from "@/lib/seatLayout";

/**
 * Shared board geometry primitives used by both the dev Layout Lab
 * (src/components/layout-lab/LayoutLabPreview.tsx) and the production Table
 * board, so the two never drift into two separate layout implementations.
 */

const AREA: Record<SeatDirection, string> = {
  top: "col-start-2 row-start-1",
  left: "col-start-1 row-start-2",
  right: "col-start-3 row-start-2",
  bottom: "col-start-2 row-start-3",
};
const ROTATION = SEAT_ROTATION;

/** Nests a `edge% / 1fr / edge%` grid on both axes, four directional cells + one center cell. */
export function Ring({
  children,
  edge,
  className = "",
}: {
  children: ReactNode;
  edge: number;
  className?: string;
}) {
  return (
    <div
      className={`grid min-h-0 min-w-0 ${className}`}
      style={{
        gridTemplateColumns: `${edge}% minmax(0,1fr) ${edge}%`,
        gridTemplateRows: `${edge}% minmax(0,1fr) ${edge}%`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Rotates its children as a whole so every direction can be authored once in
 * "bottom" (unrotated) local coordinates. Still uses cqw/cqh container query
 * units for the rotate-compensation swap (width/height transpose for
 * vertical directions) — this is a generic rotate-and-fill-footprint
 * technique unrelated to tile sizing, out of scope for the container-query
 * removal that motivated fitTileGrid (see docs/process/table-ux-plan.md).
 */
export function DirectionalSurface({
  direction,
  children,
  testId,
  inlineInsetPct = 0,
}: {
  direction: SeatDirection;
  children: ReactNode;
  testId: string;
  inlineInsetPct?: number;
}) {
  const vertical = direction === "left" || direction === "right";
  const longAxis = vertical ? "100cqh" : "100cqw";
  const longAxisUnit = vertical ? "cqh" : "cqw";
  return (
    <div
      className={`relative min-h-0 min-w-0 ${AREA[direction]}`}
      data-testid={testId}
      style={{ containerType: "size" }}
    >
      <div
        className="absolute top-1/2 left-1/2"
        data-direction-surface={direction}
        style={{
          width:
            inlineInsetPct > 0
              ? `calc(${longAxis} - ${inlineInsetPct * 2}${longAxisUnit})`
              : longAxis,
          height: vertical ? "100cqw" : "100cqh",
          transform: `translate(-50%,-50%) rotate(${ROTATION[direction]}deg)`,
          transformOrigin: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
