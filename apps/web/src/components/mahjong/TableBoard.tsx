import type { ReactNode } from "react";
import { SEAT_DIRECTIONS, type SeatDirection } from "@/lib/seatLayout";
import { DEFAULT_TABLE_LAYOUT_CONFIG, type TableLayoutConfig } from "@/lib/tableLayoutLab";
import { useMeasuredSize } from "@/lib/useMeasuredSize";
import { DIRECTION_ARROW_ICON } from "./directionArrowIcon";
import { DirectionalSurface, Ring } from "./TableGeometry";
import { DiscardPile, type DiscardEntry } from "./DiscardPile";
import { HandRow } from "./HandRow";
import { HandTrack, type HandTrackDrawn } from "./HandTrack";
import { MeldGroup, type Meld } from "./MeldGroup";
import { MeldInfoTrack } from "./MeldInfoTrack";

export interface SeatContent {
  melds: Meld[];
  /** Present only for the seat rendering as "bottom" (me) — everyone else only exposes handCount. */
  hand?: number[] | undefined;
  handCount: number;
  interactive?: boolean | undefined;
  onDiscard?: ((tile: number) => void) | undefined;
  /** Own seat: real drawn TileId. Other seats: boolean-only — the fact "just drew" is public, the tile isn't. */
  justDrawn: HandTrackDrawn;
  /** Simple per-seat identity label rendered in the meld/info track's info column — see docs/process/table-ux-plan.md P4.1 收尾. */
  info: ReactNode;
}

interface TableBoardProps {
  seats: Record<SeatDirection, SeatContent>;
  discards: Record<SeatDirection, DiscardEntry[]>;
  /** Phase/turn/claim status — see docs/process/table-ux-plan.md P4.1 收尾. */
  center: ReactNode;
  /** Direction (relative to the viewer) whose turn it currently is — drives the boundary arrow indicator below. */
  currentDirection?: SeatDirection | undefined;
  config?: TableLayoutConfig;
}

const EDGE_POSITION: Record<SeatDirection, string> = {
  top: "top-1 left-1/2 -translate-x-1/2",
  bottom: "bottom-1 left-1/2 -translate-x-1/2",
  left: "left-1 top-1/2 -translate-y-1/2",
  right: "right-1 top-1/2 -translate-y-1/2",
};

/** Sits fully inside the innermost center box, inset from the edge closest to whoever's turn it is. */
function TurnIndicator({ direction }: { direction: SeatDirection }) {
  const Icon = DIRECTION_ARROW_ICON[direction];
  return (
    <div
      data-testid="table-turn-indicator"
      data-direction={direction}
      className={`pointer-events-none absolute z-10 rounded-full bg-amber-400 p-1 text-green-950 shadow-lg ${EDGE_POSITION[direction]}`}
      style={{ width: "5cqmin", height: "5cqmin" }}
    >
      <Icon className="h-full w-full" />
    </div>
  );
}

function HandSeatTrack({
  direction,
  seat,
  config,
}: {
  direction: SeatDirection;
  seat: SeatContent;
  config: TableLayoutConfig;
}) {
  return (
    <HandTrack
      direction={direction}
      config={config}
      drawn={seat.justDrawn}
      tileCount={seat.hand?.length ?? seat.handCount}
    >
      {({ tileWidthPx, tileHeightPx }) => (
        <HandRow
          hand={seat.hand}
          handCount={seat.handCount}
          interactive={seat.interactive}
          onDiscard={seat.onDiscard}
          tileWidthPx={tileWidthPx}
          tileHeightPx={tileHeightPx}
          config={config}
        />
      )}
    </HandTrack>
  );
}

function MeldInfoSeatTrack({
  direction,
  seat,
  config,
}: {
  direction: SeatDirection;
  seat: SeatContent;
  config: TableLayoutConfig;
}) {
  return (
    <MeldInfoTrack
      direction={direction}
      config={config}
      infoContent={seat.info}
      renderMeld={({ tileWidthPx, tileHeightPx }) => (
        <MeldGroup
          direction={direction}
          melds={seat.melds}
          tileWidthPx={tileWidthPx}
          tileHeightPx={tileHeightPx}
          config={config}
        />
      )}
    />
  );
}

function DiscardTrack({
  direction,
  discards,
  config,
}: {
  direction: SeatDirection;
  discards: DiscardEntry[];
  config: TableLayoutConfig;
}) {
  const [contentRef, contentSize] = useMeasuredSize<HTMLDivElement>();
  return (
    <DirectionalSurface direction={direction} testId={`table-area-${direction}`}>
      <div ref={contentRef} className="grid h-full w-full place-items-center">
        <DiscardPile
          direction={direction}
          discards={discards}
          containerWidthPx={contentSize.width}
          containerHeightPx={contentSize.height}
          config={config}
        />
      </div>
    </DirectionalSurface>
  );
}

export function TableBoard({
  seats,
  discards,
  center,
  currentDirection,
  config = DEFAULT_TABLE_LAYOUT_CONFIG,
}: TableBoardProps) {
  return (
    <div
      data-testid="table-core"
      className="rounded-xl bg-green-800 shadow-lg ring-2 ring-border dark:bg-green-950"
      style={{
        width: "min(100cqw,100cqh)",
        height: "min(100cqw,100cqh)",
        boxSizing: "border-box",
        containerType: "size",
      }}
    >
      <Ring edge={config.hand.trackPct} className="h-full">
        {SEAT_DIRECTIONS.map((direction) => (
          <HandSeatTrack
            key={direction}
            direction={direction}
            seat={seats[direction]}
            config={config}
          />
        ))}
        <div className="col-start-2 row-start-2 min-h-0 min-w-0">
          <Ring edge={config.meldInfo.trackPct} className="h-full">
            {SEAT_DIRECTIONS.map((direction) => (
              <MeldInfoSeatTrack
                key={direction}
                direction={direction}
                seat={seats[direction]}
                config={config}
              />
            ))}
            <div className="col-start-2 row-start-2 min-h-0 min-w-0 rounded-md bg-green-700/60 dark:bg-green-900/60">
              <Ring edge={config.discard.trackPct} className="h-full">
                {SEAT_DIRECTIONS.map((direction) => (
                  <DiscardTrack
                    key={direction}
                    direction={direction}
                    discards={discards[direction]}
                    config={config}
                  />
                ))}
                <div className="relative col-start-2 row-start-2 grid min-h-0 min-w-0 place-items-center rounded-md bg-green-950/50 dark:bg-black/50">
                  <div className="grid h-full w-full place-items-center overflow-hidden">
                    {center}
                  </div>
                  {currentDirection && <TurnIndicator direction={currentDirection} />}
                </div>
              </Ring>
            </div>
          </Ring>
        </div>
      </Ring>
    </div>
  );
}
