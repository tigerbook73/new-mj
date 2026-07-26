import { DESKTOP_TABLE_PRESET } from "@/lib/desktopTablePreset";
import { SEAT_DIRECTIONS } from "@/lib/seatLayout";
import type { TableScenario, TableZoneComponent } from "../TableBoard";
import {
  DiscardTrack,
  HandSeatRow,
  InfoSlot,
  MeldSlot,
  TurnIndicator,
} from "./desktopZoneComponents";
import { MeldInfoTrack } from "../MeldInfoTrack";

const DESKTOP_ZONE_COMPONENTS: Record<string, TableZoneComponent> = {
  ...Object.fromEntries(
    SEAT_DIRECTIONS.flatMap((direction): [string, TableZoneComponent][] => [
      [
        `hand-${direction}`,
        ({ seats }) => <HandSeatRow direction={direction} seat={seats[direction]} />,
      ],
      [
        `meld-info-${direction}`,
        ({ children }) => <MeldInfoTrack direction={direction}>{children}</MeldInfoTrack>,
      ],
      [
        `meld-${direction}`,
        ({ seats }) => <MeldSlot direction={direction} seat={seats[direction]} />,
      ],
      [
        `info-${direction}`,
        ({ seats }) => <InfoSlot direction={direction} seat={seats[direction]} />,
      ],
      [
        `discard-${direction}`,
        ({ discards }) => <DiscardTrack direction={direction} discards={discards[direction]} />,
      ],
    ]),
  ),
  center: ({ center, currentDirection }) => (
    <div className="relative grid h-full w-full place-items-center rounded-md bg-green-950/50 dark:bg-black/50">
      <div className="grid h-full w-full place-items-center overflow-hidden">{center}</div>
      {currentDirection && <TurnIndicator direction={currentDirection} />}
    </div>
  ),
  "action-dock": ({ actionDock }) =>
    actionDock ? (
      <section
        data-testid="action-dock-surface"
        className="h-full w-full rounded-xl border border-white/25 bg-slate-950/70 p-3 shadow-2xl"
      >
        {actionDock}
      </section>
    ) : null,
};

/** The production desktop table: LayoutPreset + the zone components rendering into it, bundled as one swappable unit. */
export const DESKTOP_TABLE_SCENARIO: TableScenario = {
  preset: DESKTOP_TABLE_PRESET,
  components: DESKTOP_ZONE_COMPONENTS,
};
