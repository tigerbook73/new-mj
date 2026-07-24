import { SEAT_DIRECTIONS, type SeatDirection } from "@/lib/seatLayout";

export type TableZoneBinding =
  | { role: "handTrack"; direction: SeatDirection }
  | { role: "handContent"; direction: SeatDirection }
  | { role: "handDrawn"; direction: SeatDirection }
  | { role: "meldInfoTrack"; direction: SeatDirection }
  | { role: "meld"; direction: SeatDirection }
  | { role: "info"; direction: SeatDirection }
  | { role: "discard"; direction: SeatDirection }
  | { role: "center" }
  | { role: "actionDock" };

const entries = SEAT_DIRECTIONS.flatMap(
  (direction) =>
    [
      [`hand-${direction}`, { role: "handTrack", direction }],
      [`hand-content-${direction}`, { role: "handContent", direction }],
      [`hand-drawn-${direction}`, { role: "handDrawn", direction }],
      [`meld-info-${direction}`, { role: "meldInfoTrack", direction }],
      [`meld-${direction}`, { role: "meld", direction }],
      [`info-${direction}`, { role: "info", direction }],
      [`discard-${direction}`, { role: "discard", direction }],
    ] as const,
);

/** Maps production LayoutPreset ids to the business content rendered in that Zone. */
export const TABLE_ZONE_REGISTRY: Readonly<Record<string, TableZoneBinding>> = {
  ...Object.fromEntries(entries),
  center: { role: "center" },
  "action-dock": { role: "actionDock" },
};

export const resolveTableZone = (id: string) => TABLE_ZONE_REGISTRY[id];

export const REQUIRED_TABLE_ZONE_IDS = Object.keys(TABLE_ZONE_REGISTRY);
