import { fitTileGrid } from "@/lib/tableGeometry";
import type { SeatDirection } from "@/lib/seatLayout";
import type { TableLayoutConfig } from "@/lib/tableLayoutLab";
import { useMeasuredSize } from "@/lib/useMeasuredSize";
import { DirectionalSurface } from "./TableGeometry";
import { Tile } from "./Tile";

export interface HandTrackDrawn {
  /** Whether the pinned drawn-tile slot should render anything at all right now. */
  visible: boolean;
  /** Real tile face — present only for the seat's own view of its own draw; omit to render face-down (other seats). */
  tileId?: number;
  /** Present only when it's my turn and this is my own draw — discards the pinned tile directly, same affordance as a regular hand tile. */
  onClick?: () => void;
}

const HAND_CAPACITY_COLUMNS = 13;

/**
 * Hand region: a 3-column grid — an empty left column, the hand content
 * centered (or right-anchored on overflow) in the middle column, and the
 * just-drawn tile pinned in the right column. The left and right columns are
 * the same width (`sideWidthPct` of the region), so the drawn tile's
 * footprint is mirrored as empty space on the left, keeping the region
 * visually balanced.
 *
 * Shared between the dev Layout Lab (components/layout-lab/LayoutLabPreview.tsx)
 * and the production Table board so the two never drift into two separate
 * layout implementations — see docs/process/table-ux-plan.md P4.1 收尾.
 * Sizes tiles once (from the region's own measured pixels) and hands that
 * size to `children` so hand content and the drawn slot always match.
 */
export function HandTrack({
  direction,
  config,
  drawn,
  /** How many tiles `children` will render — only used to decide center vs. right-anchor on overflow, not for sizing. */
  tileCount,
  testId,
  regionTestId,
  drawnTestId,
  children,
}: {
  direction: SeatDirection;
  config: TableLayoutConfig;
  drawn: HandTrackDrawn;
  tileCount: number;
  testId?: string;
  regionTestId?: string;
  drawnTestId?: string;
  children: (size: { tileWidthPx: number; tileHeightPx: number }) => React.ReactNode;
}) {
  const { tileHeightPct, sideWidthPct } = config.hand;
  const [handRef, handSize] = useMeasuredSize<HTMLDivElement>();
  const { tileWidthPx, tileHeightPx } = fitTileGrid(handSize.width, handSize.height, {
    columns: HAND_CAPACITY_COLUMNS,
    rows: 1,
    heightPct: tileHeightPct,
    aspectRatio: config.tiles.aspectRatio,
    tileGapPx: config.tiles.tileGapPx,
  });
  const sideWidthPx = (sideWidthPct / 100) * handSize.width;
  const middleWidthPx = Math.max(0, handSize.width - 2 * sideWidthPx);
  const handWidthPx =
    tileCount > 0 ? tileCount * tileWidthPx + (tileCount - 1) * config.tiles.tileGapPx : 0;
  const handOverflows = handWidthPx > middleWidthPx;

  return (
    <DirectionalSurface direction={direction} testId={testId ?? `player-track-${direction}`}>
      <div
        ref={handRef}
        data-testid={regionTestId ?? `hand-region-${direction}`}
        className={`grid h-full w-full items-center border-2 border-dashed ${
          config.debug.showRegions ? "border-amber-300 bg-amber-300/10" : "border-transparent"
        }`}
        style={{
          gridTemplateColumns: `${sideWidthPx}px 1fr ${sideWidthPx}px`,
          boxSizing: "border-box",
        }}
      >
        <div />
        <div
          className={`grid h-full min-w-0 items-center ${handOverflows ? "justify-end" : "justify-center"}`}
        >
          {children({ tileWidthPx, tileHeightPx })}
        </div>
        <div className="flex h-full items-center justify-end">
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
    </DirectionalSurface>
  );
}
