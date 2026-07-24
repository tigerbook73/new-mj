import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assertLayoutPreset, getRenderedZoneSize, type Zone, ZoneRenderer } from "./layoutPreset";

const zone = (rotationDeg: Zone["rotationDeg"]): Zone => ({
  id: "seat",
  anchorCenter: { x: 50, y: 50 },
  localSize: { w: 80, h: 12 },
  rotationDeg,
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

describe("ZoneRenderer", () => {
  const root: Zone = {
    id: "root",
    anchorCenter: { x: 50, y: 50 },
    localSize: { w: 100, h: 100 },
    rotationDeg: 0,
    children: [{ ...zone(0), id: "leaf" }],
  };

  it("nests child ZoneFrames inside a registered service exactly once", () => {
    const markup = renderToStaticMarkup(
      createElement(ZoneRenderer, {
        zone: root,
        renderService: (current, children) =>
          current.id === "root"
            ? createElement("section", { "data-service": "root" }, children)
            : null,
      }),
    );
    expect(markup).toContain('data-zone="root"');
    expect(markup).toContain('data-service="root"><div data-zone="leaf"');
    expect(markup.match(/data-zone="leaf"/g) ?? []).toHaveLength(1);
  });

  it("rejects duplicate and missing required Zone ids before rendering", () => {
    expect(() =>
      assertLayoutPreset({
        name: "bad",
        referenceCanvas: { w: 1, h: 1 },
        root: { ...root, children: [root.children![0]!, { ...root.children![0]! }] },
      }),
    ).toThrow("duplicated");
    expect(() =>
      assertLayoutPreset({ name: "missing", referenceCanvas: { w: 1, h: 1 }, root }, ["required"]),
    ).toThrow("missing");
  });
});
