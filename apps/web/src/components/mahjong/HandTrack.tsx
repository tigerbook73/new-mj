import { fitTileGrid } from "@/lib/tableGeometry";
import type { TableLayoutMetrics } from "@/lib/desktopTablePreset";
import { findZone, zoneStyle, type Zone } from "@/lib/layoutPreset";
import type { SeatDirection } from "@/lib/seatLayout";
import { useMeasuredSize } from "@/lib/useMeasuredSize";
import { Tile } from "./Tile";

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
  drawn,
  tileCount,
  testId,
  regionTestId,
  drawnTestId,
  children,
}: {
  direction: SeatDirection;
  metrics: TableLayoutMetrics;
  /** Seat root, positioned and rotated once by ZoneRenderer. */
  zone: Zone;
  drawn: HandTrackDrawn;
  tileCount: number;
  testId?: string;
  regionTestId?: string;
  drawnTestId?: string;
  children: (size: { tileWidthPx: number; tileHeightPx: number }) => React.ReactNode;
}) {
  const contentZone = findZone(zone, `hand-content-${direction}`);
  const drawnZone = findZone(zone, `hand-drawn-${direction}`);
  if (!contentZone || !drawnZone) throw new Error(`Missing hand child zones for ${direction}`);
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
        <div
          style={zoneStyle(contentZone)}
          className={`grid min-w-0 place-items-center ${handOverflows ? "justify-end" : "justify-center"}`}
        >
          {children({ tileWidthPx, tileHeightPx })}
        </div>
        <div style={zoneStyle(drawnZone)} className="flex items-center justify-end">
          <span
            data-testid={drawnTestId ?? `hand-track-drawn-${direction}`}
            data-empty={!drawn.visible || undefined}
            className={`block ${!drawn.visible ? "invisible" : ""}`}
            style={{ width: tileWidthPx, height: tileHeightPx, boxSizing: "border-box" }}
          >
            {drawn.visible && (
              <Tile
                {...(drawn.tileId !== undefined ? { tileId: drawn.tileId } : {})}
                back={drawn.tileId === undefined}
                widthPx={tileWidthPx}
                heightPx={tileHeightPx}
                clickable={Boolean(drawn.onClick)}
                onClick={drawn.onClick}
              />
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
