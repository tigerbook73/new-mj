import type { ReactNode } from "react";
import { fitTileGrid } from "@/lib/tableGeometry";
import type { TableLayoutMetrics } from "@/lib/desktopTablePreset";
import { findZone, type Zone } from "@/lib/layoutPreset";
import type { SeatDirection } from "@/lib/seatLayout";
import { useMeasuredSize } from "@/lib/useMeasuredSize";
import { HandTrackLayoutContext } from "./handTrackContext";

export interface HandTrackDrawn {
  visible: boolean;
  tileId?: number;
  onClick?: () => void;
}

const HAND_CAPACITY_COLUMNS = 13;
/** Hand content is authored in the seat Zone's local, bottom-facing coordinate system. */
export function HandTrack({
  direction,
  metrics,
  zone,
  tileCount,
  testId,
  regionTestId,
  children,
}: {
  direction: SeatDirection;
  metrics: TableLayoutMetrics;
  /** Seat root, positioned and rotated once by ZoneRenderer. */
  zone: Zone;
  tileCount: number;
  testId?: string;
  regionTestId?: string;
  children: ReactNode;
}) {
  const contentZone = findZone(zone, `hand-content-${direction}`);
  if (!contentZone) throw new Error(`Missing hand content Zone for ${direction}`);
  const [handRef, handSize] = useMeasuredSize<HTMLDivElement>();
  const { tileWidthPx, tileHeightPx } = fitTileGrid(handSize.width, handSize.height, {
    columns: HAND_CAPACITY_COLUMNS,
    rows: 1,
    heightPct: metrics.hand.tileHeightPct,
    aspectRatio: metrics.tiles.aspectRatio,
    tileGapPx: metrics.tiles.tileGapPx,
  });
  const middleWidthPx = (contentZone.localSize.w / 100) * handSize.width;
  const handWidthPx =
    tileCount > 0 ? tileCount * tileWidthPx + (tileCount - 1) * metrics.tiles.tileGapPx : 0;
  const handOverflows = handWidthPx > middleWidthPx;

  return (
    <div data-testid={testId ?? `player-track-${direction}`} className="relative h-full w-full">
      <div
        ref={handRef}
        data-testid={regionTestId ?? `hand-region-${direction}`}
        className={`relative h-full w-full border-2 border-dashed ${metrics.debug.showRegions ? "border-amber-300 bg-amber-300/10" : "border-transparent"}`}
        style={{ boxSizing: "border-box" }}
      >
        <HandTrackLayoutContext.Provider value={{ tileWidthPx, tileHeightPx, handOverflows }}>
          {children}
        </HandTrackLayoutContext.Provider>
      </div>
    </div>
  );
}
