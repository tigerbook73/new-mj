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
        handTokenKeys={seat.handTokenKeys}
        revealed={seat.revealed}
        reflow={seat.reflow}
        animateDraw={seat.animateDraw}
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
      className={`flex h-full w-full flex-col items-start border-2 border-dashed ${config.debug.showRegions ? "border-sky-300 bg-sky-300/10" : "border-transparent"}`}
    >
      {seat.isDealer && (
        <Crown
          data-testid={`dealer-badge-${direction}`}
          className="shrink-0 text-amber-400"
          style={{ width: "4cqmin", height: "4cqmin" }}
        />
      )}
      {/* Own seat (bottom) shows "我" instead of its real nickname — every other
          seat still shows the real name it was dealt. */}
      <div className="min-h-0 w-full flex-1">
        <ScaleText text={direction === "bottom" ? "我" : seat.info} className="text-white" />
      </div>
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
const EDGE_BORDER_COLOR_CLASS: Record<TurnHighlight["tone"], Record<SeatDirection, string>> = {
  active: {
    top: "border-t-amber-400",
    bottom: "border-b-amber-400",
    left: "border-l-amber-400",
    right: "border-r-amber-400",
  },
  pending: {
    top: "border-t-slate-400",
    bottom: "border-b-slate-400",
    left: "border-l-slate-400",
    right: "border-r-slate-400",
  },
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
        "relative grid h-full w-full place-items-center overflow-hidden rounded-md border-4 border-transparent bg-green-950/50 dark:bg-black/50",
        turnHighlight && EDGE_BORDER_COLOR_CLASS[turnHighlight.tone][turnHighlight.direction],
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
    <div data-testid="game-info" className="h-full w-full p-1.5">
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
