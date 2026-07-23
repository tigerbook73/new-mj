import type { LayoutPreset, RotationDeg, Zone } from "./layoutPreset";
import { DEFAULT_TABLE_LAYOUT_CONFIG, type TableLayoutConfig } from "./tableLayoutLab";
import { SEAT_ROTATION, type SeatDirection } from "./seatLayout";

export type TableLayoutMetrics = TableLayoutConfig;

const seatDirections: readonly SeatDirection[] = ["bottom", "right", "top", "left"];

/**
 * The legacy board was three nested grids. A Zone therefore needs both its
 * own edge width and the total width already consumed by outer grids.
 */
function seatAnchor(direction: SeatDirection, inset: number, edge: number) {
  switch (direction) {
    case "bottom":
      return { x: 50, y: 100 - inset - edge / 2 };
    case "top":
      return { x: 50, y: inset + edge / 2 };
    case "left":
      return { x: inset + edge / 2, y: 50 };
    case "right":
      return { x: 100 - inset - edge / 2, y: 50 };
  }
}

function seatZone(
  id: string,
  direction: SeatDirection,
  inset: number,
  span: number,
  edge: number,
  children?: Zone[],
): Zone {
  return {
    id,
    anchorCenter: seatAnchor(direction, inset, edge),
    // Every seat is authored in its natural, bottom-facing local coordinates.
    localSize: { w: span, h: edge },
    rotationDeg: SEAT_ROTATION[direction] as RotationDeg,
    children,
  };
}

/**
 * The formerly-flat desktop TableLayoutConfig values, translated once into the
 * Zone tree used by production.  Metrics remain component-internal sizing
 * inputs; all board placement comes from zones below.
 */
export function createDesktopTablePreset(config: TableLayoutConfig): LayoutPreset {
  const handEdge = config.hand.trackPct;
  const handSpan = 100 - handEdge * 2;
  const meldEdge = handSpan * (config.meldInfo.trackPct / 100);
  const meldSpan = handSpan - meldEdge * 2;
  const discardEdge = meldSpan * (config.discard.trackPct / 100);
  const innerCanvas = meldSpan - discardEdge * 2;
  const handContentWidth = 100 - config.hand.sideWidthPct * 2;
  const meldWidth = config.meldInfo.meldWidthPct;

  return {
    name: "desktop",
    referenceCanvas: { w: 1440, h: 900 },
    root: {
      id: "table",
      anchorCenter: { x: 50, y: 50 },
      localSize: { w: 100, h: 100 },
      rotationDeg: 0,
      children: [
        ...seatDirections.map((direction) =>
          seatZone(`hand-${direction}`, direction, 0, handSpan, handEdge, [
            {
              id: `hand-content-${direction}`,
              anchorCenter: { x: 50, y: 50 },
              localSize: { w: handContentWidth, h: 100 },
              rotationDeg: 0,
            },
            {
              id: `hand-drawn-${direction}`,
              anchorCenter: { x: 100 - config.hand.sideWidthPct / 2, y: 50 },
              localSize: { w: config.hand.sideWidthPct, h: 100 },
              rotationDeg: 0,
            },
          ]),
        ),
        ...seatDirections.map((direction) =>
          seatZone(`meld-info-${direction}`, direction, handEdge, meldSpan, meldEdge, [
            {
              id: `meld-${direction}`,
              anchorCenter: { x: meldWidth / 2, y: 50 },
              localSize: { w: meldWidth, h: 100 },
              rotationDeg: 0,
            },
            {
              id: `info-${direction}`,
              anchorCenter: { x: meldWidth + (100 - meldWidth) / 2, y: 50 },
              localSize: { w: 100 - meldWidth, h: 100 },
              rotationDeg: 0,
            },
          ]),
        ),
        ...seatDirections.map((direction) =>
          seatZone(
            `discard-${direction}`,
            direction,
            handEdge + meldEdge,
            innerCanvas,
            discardEdge,
          ),
        ),
        {
          id: "center",
          anchorCenter: { x: 50, y: 50 },
          localSize: { w: innerCanvas, h: innerCanvas },
          rotationDeg: 0,
        },
      ],
    },
  };
}

export const DESKTOP_TABLE_PRESET = createDesktopTablePreset(DEFAULT_TABLE_LAYOUT_CONFIG);

export const DESKTOP_TABLE_METRICS: TableLayoutMetrics = DEFAULT_TABLE_LAYOUT_CONFIG;
