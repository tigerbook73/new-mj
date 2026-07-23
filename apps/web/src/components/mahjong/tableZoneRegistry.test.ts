import { describe, expect, it } from "vitest";
import { DESKTOP_TABLE_PRESET } from "@/lib/desktopTablePreset";
import { REQUIRED_TABLE_ZONE_IDS, resolveTableZone } from "./tableZoneRegistry";

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

  it("keeps only unknown structural Zones unbound", () => {
    expect(resolveTableZone("hand-content-bottom")).toBeDefined();
    expect(resolveTableZone("unknown")).toBeUndefined();
  });
});
