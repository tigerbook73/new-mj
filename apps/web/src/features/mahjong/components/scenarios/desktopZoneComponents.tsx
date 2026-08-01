import { Crown } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { TableLayoutConfig } from "@/features/mahjong/lib/tableLayoutConfig";
import { type SeatDirection } from "@/features/mahjong/lib/seatLayout";
import { DIRECTION_ARROW_ICON } from "../directionArrowIcon";
import { DiscardPile, type DiscardEntry } from "../DiscardPile";
import { HandRow } from "../HandRow";
import { MeldGroup } from "../MeldGroup";
import { ScaleText } from "../ScaleText";
import type { SeatContent, TurnHighlight } from "../TableBoard";

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

export function HandSeatRow({
  direction,
  seat,
  config,
}: {
  direction: SeatDirection;
  seat: SeatContent;
  config: TableLayoutConfig;
}) {
  return (
    <div data-testid={`player-track-${direction}`} className="relative h-full w-full">
      <HandRow
        direction={direction}
        handTiles={seat.handTiles}
        revealed={seat.revealed}
        interactive={seat.interactive}
        onDiscard={seat.onDiscard}
        tileHeight={config.handZone.tileHeight}
        tileGapPx={config.shared.tileGapPx}
        drawnSlotKey={seat.drawnSlotKey}
        drawnSlotLedgerKey={seat.drawnSlotLedgerKey}
        highlightCaishen={seat.highlightCaishen}
      />
    </div>
  );
}

export function MeldSlot({
  direction,
  seat,
  config,
}: {
  direction: SeatDirection;
  seat: SeatContent;
  config: TableLayoutConfig;
}) {
  const { meldHeight, meldTileHeight: meldTileHeight } = config.meldZone;
  return (
    <div
      data-testid={`meld-track-${direction}`}
      className={`flex h-full w-full flex-col justify-end border-2 border-dashed ${config.debug.showRegions ? "border-orange-300 bg-orange-300/10" : "border-transparent"}`}
    >
      <div
        className="flex items-center"
        style={{ height: `${meldHeight}%`, boxSizing: "border-box" }}
      >
        <MeldGroup
          direction={direction}
          melds={seat.melds}
          tileHeight={(meldTileHeight / meldHeight) * 100}
          config={config}
        />
      </div>
    </div>
  );
}

export function InfoSlot({
  direction,
  seat,
  config,
}: {
  direction: SeatDirection;
  seat: SeatContent;
  config: TableLayoutConfig;
}) {
  return (
    <div
      data-testid={`player-info-${direction}`}
      className={`relative h-full w-full border-2 border-dashed ${config.debug.showRegions ? "border-sky-300 bg-sky-300/10" : "border-transparent"}`}
    >
      <ScaleText text={seat.info} className="text-white" />
      {seat.isDealer && (
        <Crown
          data-testid={`dealer-badge-${direction}`}
          className="absolute top-0 right-0 text-amber-400"
          style={{ width: "4cqmin", height: "4cqmin" }}
        />
      )}
    </div>
  );
}

export function DiscardTrack({
  direction,
  discards,
  config,
}: {
  direction: SeatDirection;
  discards: DiscardEntry[];
  config: TableLayoutConfig;
}) {
  return (
    <div
      data-testid={`table-area-${direction}`}
      className="pointer-events-none grid h-full w-full place-items-center"
    >
      <DiscardPile direction={direction} discards={discards} metrics={config} />
    </div>
  );
}

/** Which edge of the center box faces each seat direction — same side the arrow sits on. */
const EDGE_BORDER_CLASS: Record<SeatDirection, string> = {
  top: "border-t-4",
  bottom: "border-b-4",
  left: "border-l-4",
  right: "border-r-4",
};

/** Desktop-only center surface; highlights the edge facing whoever currentSeat is,
 * and keeps the turn arrow above the supplied center content while it's a live turn. */
export function DesktopCenterSlot({
  center,
  turnHighlight,
}: {
  center: ReactNode;
  turnHighlight: TurnHighlight | undefined;
}) {
  return (
    <div
      className={cn(
        "relative grid h-full w-full place-items-center overflow-hidden rounded-md border-transparent bg-green-950/50 dark:bg-black/50",
        turnHighlight && EDGE_BORDER_CLASS[turnHighlight.direction],
        turnHighlight?.tone === "active" && "border-amber-400",
        turnHighlight?.tone === "pending" && "border-slate-400",
      )}
    >
      {center}
      {turnHighlight?.tone === "active" && <TurnIndicator direction={turnHighlight.direction} />}
    </div>
  );
}

/** Desktop-only corner badge for the active ruleset's logo — fills its zone completely. */
export function DesktopGameInfoSlot({ gameInfo }: { gameInfo: ReactNode | undefined }) {
  return (
    <div data-testid="game-info" className="h-full w-full">
      {gameInfo}
    </div>
  );
}

/** Desktop-only surface around the optional action panel. */
export function DesktopActionDockSlot({ actionDock }: { actionDock: ReactNode | undefined }) {
  return actionDock ? (
    <section
      data-testid="action-dock-surface"
      className="h-full w-full rounded-xl border border-white/25 bg-slate-950/70 p-3 shadow-2xl"
    >
      {actionDock}
    </section>
  ) : null;
}
import type { ReactNode } from "react";
