import { describe, expect, it } from "vitest";
import { DESKTOP_TABLE_PRESET } from "@/lib/desktopTablePreset";
import {
  REQUIRED_TABLE_ZONE_IDS,
  resolveTableZone,
  tableZonePointerEvents,
} from "./tableZoneRegistry";

const zoneIds = (zone: typeof DESKTOP_TABLE_PRESET.root): string[] => [
  zone.id,
  ...(zone.children?.flatMap(zoneIds) ?? []),
];

describe("table zone registry", () => {
  it("binds every required business Zone in the desktop preset", () => {
    const ids = new Set(zoneIds(DESKTOP_TABLE_PRESET.root));
    for (const id of REQUIRED_TABLE_ZONE_IDS) {
      expect(ids).toContain(id);
      expect(resolveTableZone(id)).toBeDefined();
    }
  });

  it("keeps structural Zones unbound and hand children pointer-transparent to their content", () => {
    expect(resolveTableZone("hand-content-bottom")).toBeUndefined();
    expect(resolveTableZone("unknown")).toBeUndefined();
    expect(tableZonePointerEvents("hand-bottom")).toBe("auto");
    expect(tableZonePointerEvents("hand-content-bottom")).toBe("none");
    expect(tableZonePointerEvents("hand-drawn-bottom")).toBe("none");
    expect(tableZonePointerEvents("discard-bottom")).toBe("none");
  });
});
