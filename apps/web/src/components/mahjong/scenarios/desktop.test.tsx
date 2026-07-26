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
    // The preset root itself is purely structural (no business content of its
    // own) and is intentionally left unbound; every other id must resolve.
    const root = DESKTOP_TABLE_SCENARIO.preset.root;
    const ids = (root.children ?? []).flatMap(zoneIds);
    for (const id of ids) {
      expect(DESKTOP_TABLE_SCENARIO.components[id]).toBeDefined();
    }
  });
});
