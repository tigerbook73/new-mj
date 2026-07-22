import { SEAT_DIRECTIONS, type SeatDirection } from "@/lib/seatLayout";

export type TableZoneBinding =
  | { role: "hand"; direction: SeatDirection }
  | { role: "meldInfo"; direction: SeatDirection }
  | { role: "discard"; direction: SeatDirection }
  | { role: "center" };

const entries = SEAT_DIRECTIONS.flatMap(
  (direction) =>
    [
      [`hand-${direction}`, { role: "hand", direction }],
      [`meld-info-${direction}`, { role: "meldInfo", direction }],
      [`discard-${direction}`, { role: "discard", direction }],
    ] as const,
);

/** Maps production LayoutPreset ids to the business content rendered in that Zone. */
export const TABLE_ZONE_REGISTRY: Readonly<Record<string, TableZoneBinding>> = {
  ...Object.fromEntries(entries),
  center: { role: "center" },
};

/**
 * HandTrack owns the interactive tiles. Its structural child Zones are
 * separately rendered transparent overlays, so they must not take pointer
 * events away from the HandTrack underneath.
 */
const HAND_POINTER_ZONE_IDS = new Set(SEAT_DIRECTIONS.map((direction) => `hand-${direction}`));

export const resolveTableZone = (id: string) => TABLE_ZONE_REGISTRY[id];
export const tableZonePointerEvents = (id: string) =>
  HAND_POINTER_ZONE_IDS.has(id) ? "auto" : "none";

export const REQUIRED_TABLE_ZONE_IDS = Object.keys(TABLE_ZONE_REGISTRY);
