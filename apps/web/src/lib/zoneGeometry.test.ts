import { describe, expect, it } from "vitest";
import type { Zone } from "./layoutPreset";
import { applyMatrix, visualBounds, worldToParentPoint, zoneToWorldMatrix } from "./zoneGeometry";

const zone = (patch: Partial<Zone> = {}): Zone => ({
  id: "zone",
  anchorCenter: { x: 50, y: 50 },
  localSize: { w: 40, h: 20 },
  rotationDeg: 0,
  arrangement: { mode: "absolute", points: [] },
  ...patch,
});

describe("zone geometry", () => {
  it("composes nested quarter turns and reverses world points into the parent space", () => {
    const parent = zone({ id: "parent", rotationDeg: 90, localSize: { w: 100, h: 100 } });
    const child = zone({ id: "child", anchorCenter: { x: 75, y: 50 }, rotationDeg: -90 });
    const matrix = zoneToWorldMatrix([parent], child);
    expect(applyMatrix(matrix, { x: 50, y: 50 })).toEqual({ x: 50, y: 75 });
    expect(worldToParentPoint([parent], { x: 50, y: 75 })).toEqual({ x: 75, y: 50 });
  });

  it("reports the final axis-aligned visual bounds", () => {
    const matrix = zoneToWorldMatrix([], zone({ rotationDeg: 90 }));
    expect(visualBounds(matrix)).toEqual({ left: 40, top: 30, width: 20, height: 40 });
  });
});
