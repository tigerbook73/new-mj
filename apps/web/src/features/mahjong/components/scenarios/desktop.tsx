import {
  desktopTableLayout,
  desktopTableLayoutConfig,
} from "@/features/mahjong/desktop.table-config";
import type { TableLayoutConfig } from "@/features/mahjong/lib/tableLayoutConfig";
import type { LayoutPreset } from "@/shared/lib/layoutPreset";
import { SEAT_DIRECTIONS } from "@/features/mahjong/lib/seatLayout";
import type { TableScenario, TableZoneComponent } from "../TableBoard";
import {
  DesktopActionDockSlot,
  DesktopCenterSlot,
  DiscardTrack,
  HandSeatRow,
  InfoSlot,
  MeldSlot,
} from "./desktopZoneComponents";

const DESKTOP_ZONE_COMPONENTS: Record<string, TableZoneComponent> = {
  ...Object.fromEntries(
    SEAT_DIRECTIONS.flatMap((direction): [string, TableZoneComponent][] => [
      [
        `hand-${direction}`,
        ({ seats, config }) => (
          <HandSeatRow direction={direction} seat={seats[direction]} config={config} />
        ),
      ],
      [
        `meld-${direction}`,
        ({ seats, config }) => (
          <MeldSlot direction={direction} seat={seats[direction]} config={config} />
        ),
      ],
      [
        `info-${direction}`,
        ({ seats, config }) => (
          <InfoSlot direction={direction} seat={seats[direction]} config={config} />
        ),
      ],
      [
        `discard-${direction}`,
        ({ discards, config }) => (
          <DiscardTrack direction={direction} discards={discards[direction]} config={config} />
        ),
      ],
    ]),
  ),
  center: ({ center, currentDirection }) => (
    <DesktopCenterSlot center={center} currentDirection={currentDirection} />
  ),
  "action-dock": ({ actionDock }) => <DesktopActionDockSlot actionDock={actionDock} />,
};

/** The production desktop table: LayoutPreset + the zone components rendering into it, bundled as one swappable unit. */
export const createDesktopTableScenario = (
  preset: LayoutPreset,
  config: TableLayoutConfig,
): TableScenario => ({
  preset,
  config,
  components: DESKTOP_ZONE_COMPONENTS,
});

export const DESKTOP_TABLE_SCENARIO = createDesktopTableScenario(
  desktopTableLayout,
  desktopTableLayoutConfig,
);
