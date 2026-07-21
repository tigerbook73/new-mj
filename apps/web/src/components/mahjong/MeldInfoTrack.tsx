import type { TableLayoutMetrics } from "@/lib/desktopTablePreset";
import { findZone, zoneStyle, type Zone } from "@/lib/layoutPreset";
import { SEAT_ROTATION, type SeatDirection } from "@/lib/seatLayout";
import { useMeasuredSize } from "@/lib/useMeasuredSize";

/** Meld and information columns consume child Zones rather than independent percentage props. */
export function MeldInfoTrack({
  direction,
  metrics,
  zone,
  testId,
  contentTestId,
  renderMeld,
  infoContent,
}: {
  direction: SeatDirection;
  metrics: TableLayoutMetrics;
  zone: Zone;
  testId?: string;
  contentTestId?: string;
  renderMeld: (size: { tileWidthPx: number; tileHeightPx: number }) => React.ReactNode;
  infoContent: React.ReactNode;
}) {
  const meldZone = findZone(zone, `meld-${direction}`);
  const infoZone = findZone(zone, `info-${direction}`);
  if (!meldZone || !infoZone) throw new Error(`Missing meld/info child zones for ${direction}`);
  const [meldRef, meldSize] = useMeasuredSize<HTMLDivElement>();
  const [infoRef, infoSize] = useMeasuredSize<HTMLDivElement>();
  const infoFontSizePx = infoSize.height * 0.25;
  const vertical = direction === "left" || direction === "right";
  const infoTextBoxWidthPx = vertical ? infoSize.height : infoSize.width;
  const infoTextBoxHeightPx = vertical ? infoSize.width : infoSize.height;
  const tileHeightPx = (metrics.meldInfo.meldTileHeightPct / 100) * meldSize.height;
  const tileWidthPx = tileHeightPx / metrics.tiles.aspectRatio;

  return (
    <div data-testid={testId ?? `meld-info-track-${direction}`} className="relative h-full w-full">
      <div
        data-testid={contentTestId ?? `meld-info-content-${direction}`}
        className="relative h-full w-full"
        style={{ boxSizing: "border-box" }}
      >
        <div
          className={`absolute flex flex-col justify-end border-2 border-dashed ${metrics.debug.showRegions ? "border-orange-300 bg-orange-300/10" : "border-transparent"}`}
          style={{ ...zoneStyle(meldZone), boxSizing: "border-box" }}
        >
          <div
            ref={meldRef}
            className="flex items-center"
            style={{ height: `${metrics.meldInfo.meldHeightPct}%`, boxSizing: "border-box" }}
          >
            {renderMeld({ tileWidthPx, tileHeightPx })}
          </div>
        </div>
        <div
          ref={infoRef}
          data-testid={`player-info-${direction}`}
          className={`absolute border-2 border-dashed ${metrics.debug.showRegions ? "border-sky-300 bg-sky-300/10" : "border-transparent"}`}
          style={{ ...zoneStyle(infoZone), boxSizing: "border-box" }}
        >
          <div
            className="absolute top-1/2 left-1/2 flex items-center justify-center overflow-hidden"
            style={{
              width: infoTextBoxWidthPx,
              height: infoTextBoxHeightPx,
              transform: `translate(-50%,-50%) rotate(${-SEAT_ROTATION[direction]}deg)`,
            }}
          >
            <span
              className="truncate rounded bg-black/30 px-2 py-0.5 text-white"
              style={{ fontSize: infoFontSizePx, maxWidth: "100%" }}
            >
              {infoContent}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
