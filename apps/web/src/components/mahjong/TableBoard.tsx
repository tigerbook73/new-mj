import type { ReactNode } from "react";
import { DESKTOP_TABLE_METRICS, DESKTOP_TABLE_PRESET } from "@/lib/desktopTablePreset";
import { type Zone, ZoneRenderer } from "@/lib/layoutPreset";
import { type SeatDirection } from "@/lib/seatLayout";
import { useMeasuredSize } from "@/lib/useMeasuredSize";
import { DIRECTION_ARROW_ICON } from "./directionArrowIcon";
import { DiscardPile, type DiscardEntry } from "./DiscardPile";
import { HandRow } from "./HandRow";
import { HandTrack, type HandTrackDrawn } from "./HandTrack";
import { MeldGroup, type Meld } from "./MeldGroup";
import { MeldInfoTrack } from "./MeldInfoTrack";
import { resolveTableZone, tableZonePointerEvents } from "./tableZoneRegistry";

export interface SeatContent {
  melds: Meld[];
  hand?: number[] | undefined;
  handCount: number;
  interactive?: boolean | undefined;
  onDiscard?: ((tile: number) => void) | undefined;
  justDrawn: HandTrackDrawn;
  info: ReactNode;
}

interface TableBoardProps {
  seats: Record<SeatDirection, SeatContent>;
  discards: Record<SeatDirection, DiscardEntry[]>;
  center: ReactNode;
  currentDirection?: SeatDirection | undefined;
}

const EDGE_POSITION: Record<SeatDirection, string> = {
  top: "top-1 left-1/2 -translate-x-1/2",
  bottom: "bottom-1 left-1/2 -translate-x-1/2",
  left: "left-1 top-1/2 -translate-y-1/2",
  right: "right-1 top-1/2 -translate-y-1/2",
};

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
  zone,
}: {
  direction: SeatDirection;
  seat: SeatContent;
  zone: Zone;
}) {
  return (
    <HandTrack
      direction={direction}
      metrics={DESKTOP_TABLE_METRICS}
      zone={zone}
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
          config={DESKTOP_TABLE_METRICS}
        />
      )}
    </HandTrack>
  );
}

function MeldInfoSeatTrack({
  direction,
  seat,
  zone,
}: {
  direction: SeatDirection;
  seat: SeatContent;
  zone: Zone;
}) {
  return (
    <MeldInfoTrack
      direction={direction}
      metrics={DESKTOP_TABLE_METRICS}
      zone={zone}
      infoContent={seat.info}
      renderMeld={({ tileWidthPx, tileHeightPx }) => (
        <MeldGroup
          direction={direction}
          melds={seat.melds}
          tileWidthPx={tileWidthPx}
          tileHeightPx={tileHeightPx}
          config={DESKTOP_TABLE_METRICS}
        />
      )}
    />
  );
}

function DiscardTrack({
  direction,
  discards,
}: {
  direction: SeatDirection;
  discards: DiscardEntry[];
}) {
  const [contentRef, contentSize] = useMeasuredSize<HTMLDivElement>();
  return (
    <div
      data-testid={`table-area-${direction}`}
      className="pointer-events-none grid h-full w-full place-items-center"
    >
      <div ref={contentRef} className="grid h-full w-full place-items-center">
        <DiscardPile
          direction={direction}
          discards={discards}
          containerWidthPx={contentSize.width}
          containerHeightPx={contentSize.height}
          metrics={DESKTOP_TABLE_METRICS}
        />
      </div>
    </div>
  );
}

/** Production board placement is entirely driven by DESKTOP_TABLE_PRESET's Zone tree. */
export function TableBoard({ seats, discards, center, currentDirection }: TableBoardProps) {
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
      <ZoneRenderer
        zone={DESKTOP_TABLE_PRESET.root}
        getPointerEvents={(zone) => tableZonePointerEvents(zone.id)}
        renderZone={(zone) => {
          const binding = resolveTableZone(zone.id);
          switch (binding?.role) {
            case "hand":
              return (
                <HandSeatTrack
                  direction={binding.direction}
                  seat={seats[binding.direction]}
                  zone={zone}
                />
              );
            case "meldInfo":
              return (
                <MeldInfoSeatTrack
                  direction={binding.direction}
                  seat={seats[binding.direction]}
                  zone={zone}
                />
              );
            case "discard":
              return (
                <DiscardTrack
                  direction={binding.direction}
                  discards={discards[binding.direction]}
                />
              );
            case "center":
              return (
                <div className="relative grid h-full w-full place-items-center rounded-md bg-green-950/50 dark:bg-black/50">
                  <div className="grid h-full w-full place-items-center overflow-hidden">
                    {center}
                  </div>
                  {currentDirection && <TurnIndicator direction={currentDirection} />}
                </div>
              );
            default:
              return null;
          }
        }}
      />
    </div>
  );
}
