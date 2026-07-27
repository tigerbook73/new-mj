import { describe, expect, it } from "vitest";
import { assertLayoutPreset } from "@/lib/layoutPreset";
import { DESKTOP_TABLE_SCENARIO } from "./desktop";

const zoneIds = (zone: (typeof DESKTOP_TABLE_SCENARIO)["preset"]["root"]): string[] => [
  zone.id,
  ...(zone.children?.flatMap(zoneIds) ?? []),
];

describe("desktop table scenario", () => {
  it("binds every zone required by its own preset", () => {
    expect(() =>
      assertLayoutPreset(
        DESKTOP_TABLE_SCENARIO.preset,
        Object.keys(DESKTOP_TABLE_SCENARIO.components),
      ),
    ).not.toThrow();
  });

  it("has no unbound zone ids left over in the preset tree", () => {
    // The preset root and these two wrapper zones are purely structural (no
    // business content of their own, just coordinate grouping — see
    // architecture/frontend-layout.md on unregistered/structural Zones) and
    // are intentionally left unbound; every other id must resolve.
    const structural = new Set(["hand-inner", "meld-inner"]);
    const root = DESKTOP_TABLE_SCENARIO.preset.root;
    const ids = (root.children ?? []).flatMap(zoneIds);
    for (const id of ids) {
      if (structural.has(id)) continue;
      expect(DESKTOP_TABLE_SCENARIO.components[id]).toBeDefined();
    }
  });
});
