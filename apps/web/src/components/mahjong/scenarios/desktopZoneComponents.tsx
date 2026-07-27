import { desktopTableLayoutConfig } from "@/layouts/desktop.table-config";
import { type SeatDirection } from "@/lib/seatLayout";
import { ActionLabel } from "../ActionLabel";
import { DIRECTION_ARROW_ICON } from "../directionArrowIcon";
import { DiscardPile, type DiscardEntry } from "../DiscardPile";
import { HandRow } from "../HandRow";
import { MeldGroup } from "../MeldGroup";
import type { SeatContent } from "../TableBoard";

const EDGE_POSITION: Record<SeatDirection, string> = {
  top: "top-1 left-1/2 -translate-x-1/2",
  bottom: "bottom-1 left-1/2 -translate-x-1/2",
  left: "left-1 top-1/2 -translate-y-1/2",
  right: "right-1 top-1/2 -translate-y-1/2",
};

export function TurnIndicator({ direction }: { direction: SeatDirection }) {
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

export function HandSeatRow({ direction, seat }: { direction: SeatDirection; seat: SeatContent }) {
  return (
    <div data-testid={`player-track-${direction}`} className="relative h-full w-full">
      <HandRow
        direction={direction}
        handTiles={seat.handTiles}
        revealed={seat.revealed}
        interactive={seat.interactive}
        onDiscard={seat.onDiscard}
        tileHeightPct={desktopTableLayoutConfig.handZone.tileHeight}
        tileGapPx={desktopTableLayoutConfig.shared.tileGapPx}
        drawnSlotKey={seat.drawnSlotKey}
        drawnSlotEntering={seat.drawnSlotEntering}
      />
    </div>
  );
}

export function MeldSlot({ direction, seat }: { direction: SeatDirection; seat: SeatContent }) {
  const { meldHeight: meldHeightPct, meldTileHeight: meldTileHeightPct } =
    desktopTableLayoutConfig.meldZone;
  return (
    <div
      data-testid={`meld-track-${direction}`}
      className={`flex h-full w-full flex-col justify-end border-2 border-dashed ${desktopTableLayoutConfig.debug.showRegions ? "border-orange-300 bg-orange-300/10" : "border-transparent"}`}
    >
      <div
        className="flex items-center"
        style={{ height: `${meldHeightPct}%`, boxSizing: "border-box" }}
      >
        <MeldGroup
          direction={direction}
          melds={seat.melds}
          tileHeightPct={(meldTileHeightPct / meldHeightPct) * 100}
          config={desktopTableLayoutConfig}
          entering={seat.meldEntering}
        />
      </div>
    </div>
  );
}

export function InfoSlot({ direction, seat }: { direction: SeatDirection; seat: SeatContent }) {
  return (
    <div
      data-testid={`player-info-${direction}`}
      className={`h-full w-full border-2 border-dashed ${desktopTableLayoutConfig.debug.showRegions ? "border-sky-300 bg-sky-300/10" : "border-transparent"}`}
      style={{ containerType: "size" }}
    >
      <ActionLabel text={seat.info} className="text-white w-[40%] h-[40%]" />
    </div>
  );
}

export function DiscardTrack({
  direction,
  discards,
}: {
  direction: SeatDirection;
  discards: DiscardEntry[];
}) {
  return (
    <div
      data-testid={`table-area-${direction}`}
      className="pointer-events-none grid h-full w-full place-items-center"
    >
      <DiscardPile direction={direction} discards={discards} metrics={desktopTableLayoutConfig} />
    </div>
  );
}
