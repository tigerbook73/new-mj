import { describe, expect, it } from "vitest";
import { getRenderedZoneSize, type Zone } from "./layoutPreset";

const zone = (rotationDeg: Zone["rotationDeg"]): Zone => ({
  id: "seat", anchorCenter: { x: 50, y: 50 }, localSize: { w: 80, h: 12 }, rotationDeg,
  arrangement: { mode: "absolute", points: [] },
});

describe("Zone geometry", () => {
  it("swaps the rendered footprint only for quarter turns", () => {
    expect(getRenderedZoneSize(zone(0))).toEqual({ w: 80, h: 12 });
    expect(getRenderedZoneSize(zone(90))).toEqual({ w: 12, h: 80 });
    expect(getRenderedZoneSize(zone(-90))).toEqual({ w: 12, h: 80 });
    expect(getRenderedZoneSize(zone(180))).toEqual({ w: 80, h: 12 });
  });

  it("keeps child coordinates local: only its own declared rotation is translated", () => {
    const child = { ...zone(0), anchorCenter: { x: 25, y: 75 } };
    expect(getRenderedZoneSize(child)).toEqual({ w: 80, h: 12 });
    expect(child.anchorCenter).toEqual({ x: 25, y: 75 });
  });
});
