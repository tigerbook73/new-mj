import { SEAT_ROTATION, type SeatDirection } from "@/lib/seatLayout";
import type { TableLayoutConfig } from "@/lib/tableLayoutLab";
import { useMeasuredSize } from "@/lib/useMeasuredSize";
import { DirectionalSurface } from "./TableGeometry";

/**
 * Renders in the region that used to show the face-down wall stack: Meld
 * (left, bottom-aligned) + per-seat info (right, counter-rotated so it always
 * reads upright regardless of seat direction).
 *
 * Shared between the dev Layout Lab (components/layout-lab/LayoutLabPreview.tsx)
 * and the production Table board — see docs/process/table-ux-plan.md P4.1 收尾.
 * Sizes meld tiles once (from the meld column's own measured pixels) and
 * hands that size to `renderMeld` so callers never re-derive it.
 */
export function MeldInfoTrack({
  direction,
  config,
  testId,
  contentTestId,
  renderMeld,
  infoContent,
}: {
  direction: SeatDirection;
  config: TableLayoutConfig;
  testId?: string;
  contentTestId?: string;
  renderMeld: (size: { tileWidthPx: number; tileHeightPx: number }) => React.ReactNode;
  infoContent: React.ReactNode;
}) {
  const { meldWidthPct, meldHeightPct, meldTileHeightPct } = config.meldInfo;
  const infoWidthPct = 100 - meldWidthPct;
  const [meldRef, meldSize] = useMeasuredSize<HTMLDivElement>();
  const [infoRef, infoSize] = useMeasuredSize<HTMLDivElement>();
  const infoFontSizePx = infoSize.height * 0.25;
  const infoVertical = direction === "left" || direction === "right";
  /** The counter-rotation below cancels the ambient rotation net, so this wrapper's own
   * width/height render on screen exactly as authored — set them to the region's actual
   * on-screen footprint (swapped for left/right, where the ambient rotation swaps axes). */
  const infoTextBoxWidthPx = infoVertical ? infoSize.height : infoSize.width;
  const infoTextBoxHeightPx = infoVertical ? infoSize.width : infoSize.height;
  const tileHeightPx = (meldTileHeightPct / 100) * meldSize.height;
  const tileWidthPx = tileHeightPx / config.tiles.aspectRatio;

  return (
    <DirectionalSurface direction={direction} testId={testId ?? `meld-info-track-${direction}`}>
      <div
        data-testid={contentTestId ?? `meld-info-content-${direction}`}
        className="flex h-full w-full"
        style={{ boxSizing: "border-box" }}
      >
        <div
          className={`flex h-full flex-col justify-end border-2 border-dashed ${
            config.debug.showRegions ? "border-orange-300 bg-orange-300/10" : "border-transparent"
          }`}
          style={{ width: `${meldWidthPct}%`, boxSizing: "border-box" }}
        >
          <div ref={meldRef} style={{ height: `${meldHeightPct}%`, boxSizing: "border-box" }}>
            {renderMeld({ tileWidthPx, tileHeightPx })}
          </div>
        </div>
        <div
          ref={infoRef}
          data-testid={`player-info-${direction}`}
          className={`relative h-full border-2 border-dashed ${
            config.debug.showRegions ? "border-sky-300 bg-sky-300/10" : "border-transparent"
          }`}
          style={{ width: `${infoWidthPct}%`, boxSizing: "border-box" }}
        >
          {/* Counter-rotate against the ambient DirectionalSurface rotation so the label always
           * renders upright, regardless of seat direction; clipped + ellipsized to this wrapper's
           * own on-screen footprint so a long label never spills outside the region. */}
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
    </DirectionalSurface>
  );
}
