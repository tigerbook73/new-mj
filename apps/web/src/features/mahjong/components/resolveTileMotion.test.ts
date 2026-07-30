import { describe, expect, it } from "vitest";
import { resolveTileMotion } from "./resolveTileMotion";

describe("resolveTileMotion", () => {
  it("plays no transition at all when not entering", () => {
    const spec = resolveTileMotion(false);
    expect(spec.initial).toBe(false);
    expect(spec.animate).toEqual({ opacity: 1, scale: 1, y: 0 });
  });

  it("treats undefined the same as false", () => {
    expect(resolveTileMotion(undefined).initial).toBe(false);
  });

  it("plays the full fade+scale+rise entrance when entering is true", () => {
    const spec = resolveTileMotion(true);
    expect(spec.initial).toEqual({ opacity: 0, scale: 0.75, y: 24 });
    expect(spec.animate).toEqual({ opacity: 1, scale: 1, y: 0 });
  });

  it("skips scale and rise, keeping only opacity, for opacityOnly", () => {
    const spec = resolveTileMotion("opacityOnly");
    expect(spec.initial).toEqual({ opacity: 0, scale: 1, y: 0 });
    expect(spec.animate).toEqual({ opacity: 1, scale: 1, y: 0 });
  });

  it("always rests at scale 1 regardless of entering mode — enlarged/dimmed compose on top via TileFace's own CSS", () => {
    expect(resolveTileMotion(true).animate.scale).toBe(1);
    expect(resolveTileMotion("opacityOnly").animate.scale).toBe(1);
    expect(resolveTileMotion(false).animate.scale).toBe(1);
  });

  it("uses the same transition timing regardless of entering mode", () => {
    const { transition } = resolveTileMotion(true);
    expect(resolveTileMotion("opacityOnly").transition).toEqual(transition);
    expect(resolveTileMotion(false).transition).toEqual(transition);
  });
});
