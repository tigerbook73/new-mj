import { describe, expect, it } from "vitest";
import { createDesktopTablePreset } from "./desktopTablePreset";
import { getRenderedZoneSize, type Zone } from "./layoutPreset";
import { DEFAULT_TABLE_LAYOUT_CONFIG } from "./tableLayoutLab";

const zone = (rotationDeg: Zone["rotationDeg"]): Zone => ({
  id: "seat",
  anchorCenter: { x: 50, y: 50 },
  localSize: { w: 80, h: 12 },
  rotationDeg,
});

describe("desktop table preset", () => {
  it("reproduces the bounds of the legacy nested Grid rings", () => {
    const zones = createDesktopTablePreset(DEFAULT_TABLE_LAYOUT_CONFIG).root.children!;
    const byId = (id: string) => zones.find((zone) => zone.id === id)!;

    // Grid 1: 12% / 76% / 12%; Grid 2 within its centre: 7.6% / 60.8% / 7.6%;
    // Grid 3 within that centre: 16.416% / 27.968% / 16.416%.
    expect(byId("hand-bottom")).toMatchObject({
      anchorCenter: { x: 50, y: 94 },
      localSize: { w: 76, h: 12 },
    });
    expect(byId("meld-info-bottom").anchorCenter).toEqual({ x: 50, y: 84.2 });
    expect(byId("meld-info-bottom").localSize.w).toBeCloseTo(60.8);
    expect(byId("meld-info-bottom").localSize.h).toBeCloseTo(7.6);
    expect(byId("discard-bottom").anchorCenter.y).toBeCloseTo(72.192);
    expect(byId("discard-bottom").localSize.w).toBeCloseTo(27.968);
    expect(byId("discard-bottom").localSize.h).toBeCloseTo(16.416);
    expect(byId("meld-info-left").anchorCenter).toEqual({ x: 15.8, y: 50 });
    expect(byId("meld-info-left").localSize.w).toBeCloseTo(60.8);
    expect(byId("meld-info-left").localSize.h).toBeCloseTo(7.6);
    expect(byId("discard-left").anchorCenter.x).toBeCloseTo(27.808);
  });
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
