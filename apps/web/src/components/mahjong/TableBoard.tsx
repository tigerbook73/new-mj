import type { ReactNode } from "react";
import { DESKTOP_TABLE_METRICS } from "@/lib/desktopTablePreset";
import { assertLayoutPreset, type LayoutPreset, type Zone, ZoneRenderer } from "@/lib/layoutPreset";
import { SEAT_ROTATION, type SeatDirection } from "@/lib/seatLayout";
import { useMeasuredSize } from "@/lib/useMeasuredSize";
import { DIRECTION_ARROW_ICON } from "./directionArrowIcon";
import { DiscardPile, type DiscardEntry } from "./DiscardPile";
import { HandRow } from "./HandRow";
import { HandTrack, type HandTrackDrawn } from "./HandTrack";
import { useHandTrackLayout } from "./handTrackContext";
import { MeldGroup, type Meld } from "./MeldGroup";
import { MeldInfoTrack } from "./MeldInfoTrack";
import { Tile } from "./Tile";
import { REQUIRED_TABLE_ZONE_IDS, resolveTableZone } from "./tableZoneRegistry";

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
  preset: LayoutPreset;
  seats: Record<SeatDirection, SeatContent>;
  discards: Record<SeatDirection, DiscardEntry[]>;
  center: ReactNode;
  actionDock?: ReactNode;
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
  children,
}: {
  direction: SeatDirection;
  seat: SeatContent;
  zone: Zone;
  children: ReactNode;
}) {
  return (
    <HandTrack
      direction={direction}
      metrics={DESKTOP_TABLE_METRICS}
      zone={zone}
      tileCount={seat.hand?.length ?? seat.handCount}
    >
      {children}
    </HandTrack>
  );
}

function HandContent({ seat }: { seat: SeatContent }) {
  const { tileWidthPx, tileHeightPx, handOverflows } = useHandTrackLayout();
  return (
    <div
      className={`grid h-full w-full min-w-0 place-items-center ${handOverflows ? "justify-end" : "justify-center"}`}
    >
      <HandRow
        hand={seat.hand}
        handCount={seat.handCount}
        interactive={seat.interactive}
        onDiscard={seat.onDiscard}
        tileWidthPx={tileWidthPx}
        tileHeightPx={tileHeightPx}
        config={DESKTOP_TABLE_METRICS}
      />
    </div>
  );
}

function HandDrawn({ direction, drawn }: { direction: SeatDirection; drawn: HandTrackDrawn }) {
  const { tileWidthPx, tileHeightPx } = useHandTrackLayout();
  return (
    <div
      data-testid={`hand-track-drawn-${direction}`}
      data-empty={!drawn.visible || undefined}
      className={`flex h-full w-full items-center justify-end ${!drawn.visible ? "invisible" : ""}`}
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
    </div>
  );
}

function MeldSlot({ direction, seat }: { direction: SeatDirection; seat: SeatContent }) {
  const [ref, size] = useMeasuredSize<HTMLDivElement>();
  const tileHeightPx = (DESKTOP_TABLE_METRICS.meldInfo.meldTileHeightPct / 100) * size.height;
  return (
    <div
      ref={ref}
      className={`flex h-full w-full flex-col justify-end border-2 border-dashed ${DESKTOP_TABLE_METRICS.debug.showRegions ? "border-orange-300 bg-orange-300/10" : "border-transparent"}`}
    >
      <div
        className="flex items-center"
        style={{
          height: `${DESKTOP_TABLE_METRICS.meldInfo.meldHeightPct}%`,
          boxSizing: "border-box",
        }}
      >
        <MeldGroup
          direction={direction}
          melds={seat.melds}
          tileWidthPx={tileHeightPx / DESKTOP_TABLE_METRICS.tiles.aspectRatio}
          tileHeightPx={tileHeightPx}
          config={DESKTOP_TABLE_METRICS}
        />
      </div>
    </div>
  );
}

function InfoSlot({ direction, content }: { direction: SeatDirection; content: ReactNode }) {
  const [ref, size] = useMeasuredSize<HTMLDivElement>();
  const vertical = direction === "left" || direction === "right";
  return (
    <div
      ref={ref}
      data-testid={`player-info-${direction}`}
      className={`h-full w-full border-2 border-dashed ${DESKTOP_TABLE_METRICS.debug.showRegions ? "border-sky-300 bg-sky-300/10" : "border-transparent"}`}
    >
      <div
        className="absolute top-1/2 left-1/2 flex items-center justify-center overflow-hidden"
        style={{
          width: vertical ? size.height : size.width,
          height: vertical ? size.width : size.height,
          transform: `translate(-50%,-50%) rotate(${-SEAT_ROTATION[direction]}deg)`,
        }}
      >
        <span
          className="truncate rounded bg-black/30 px-2 py-0.5 text-white"
          style={{ fontSize: size.height * 0.25, maxWidth: "100%" }}
        >
          {content}
        </span>
      </div>
    </div>
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

/** Production board placement is entirely driven by the caller-supplied LayoutPreset tree. */
export function TableBoard({
  preset,
  seats,
  discards,
  center,
  actionDock,
  currentDirection,
}: TableBoardProps) {
  assertLayoutPreset(preset, REQUIRED_TABLE_ZONE_IDS);
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
        zone={preset.root}
        renderService={(zone, children) => {
          const binding = resolveTableZone(zone.id);
          switch (binding?.role) {
            case "handTrack":
              return (
                <HandSeatTrack
                  direction={binding.direction}
                  seat={seats[binding.direction]}
                  zone={zone}
                >
                  {children}
                </HandSeatTrack>
              );
            case "handContent":
              return <HandContent seat={seats[binding.direction]} />;
            case "handDrawn":
              return (
                <HandDrawn
                  direction={binding.direction}
                  drawn={seats[binding.direction].justDrawn}
                />
              );
            case "meldInfoTrack":
              return <MeldInfoTrack direction={binding.direction}>{children}</MeldInfoTrack>;
            case "meld":
              return <MeldSlot direction={binding.direction} seat={seats[binding.direction]} />;
            case "info":
              return (
                <InfoSlot direction={binding.direction} content={seats[binding.direction].info} />
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
            case "actionDock":
              return actionDock ? (
                <section
                  data-testid="action-dock-surface"
                  className="flex h-full w-full items-center justify-center rounded-xl border border-white/25 bg-slate-950/55 p-3 shadow-2xl backdrop-blur-md"
                  style={{
                    containerType: "size",
                    padding: "clamp(0.35rem, 4cqi, 0.75rem)",
                  }}
                >
                  {actionDock}
                </section>
              ) : null;
            default:
              return null;
          }
        }}
      />
    </div>
  );
}
