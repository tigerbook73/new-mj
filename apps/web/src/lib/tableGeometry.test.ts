import { describe, expect, it } from "vitest";
import { DEFAULT_TABLE_LAYOUT_CONFIG } from "./tableLayoutLab";
import { fitTileGrid } from "./tableGeometry";

describe("fitTileGrid", () => {
  const base = {
    columns: 8,
    rows: 3,
    heightPct: DEFAULT_TABLE_LAYOUT_CONFIG.tiles.discardShortPct,
    aspectRatio: DEFAULT_TABLE_LAYOUT_CONFIG.tiles.aspectRatio,
    tileGapPx: DEFAULT_TABLE_LAYOUT_CONFIG.tiles.tileGapPx,
  };

  it("keeps tiles within the container height budget implied by heightPct", () => {
    const { tileHeightPx } = fitTileGrid(2000, 100, base);
    expect(tileHeightPx).toBeLessThanOrEqual((base.heightPct / 100) * 100 + 1e-9);
  });

  it("shrinks to fit the row count when height is the binding constraint", () => {
    const { tileHeightPx } = fitTileGrid(2000, 100, base);
    const totalRowGapPx = (base.rows - 1) * base.tileGapPx;
    expect(tileHeightPx).toBeLessThanOrEqual((100 - totalRowGapPx) / base.rows + 1e-9);
  });

  it("shrinks to fit the column count when width is the binding constraint", () => {
    const { tileWidthPx } = fitTileGrid(100, 2000, base);
    const totalColumnGapPx = (base.columns - 1) * base.tileGapPx;
    expect(tileWidthPx).toBeLessThanOrEqual((100 - totalColumnGapPx) / base.columns + 1e-9);
  });

  it("keeps tileWidthPx and tileHeightPx at the configured aspect ratio", () => {
    const { tileWidthPx, tileHeightPx } = fitTileGrid(600, 400, base);
    expect(tileHeightPx / tileWidthPx).toBeCloseTo(base.aspectRatio, 10);
  });

  it("never returns a negative size for a zero or negative container", () => {
    expect(fitTileGrid(0, 0, base)).toEqual({ tileWidthPx: 0, tileHeightPx: 0 });
    const { tileHeightPx, tileWidthPx } = fitTileGrid(-10, -10, base);
    expect(tileHeightPx).toBe(0);
    expect(tileWidthPx).toBe(0);
  });

  it("matches a hand-computed value for a known input", () => {
    // heightPct bound: 72% of 200 = 144; row bound: (200-0)/1 = 200;
    // column bound: (500 - 13*1) * 1.333 / 14 ≈ 46.35 -> binding constraint.
    const result = fitTileGrid(500, 200, {
      columns: 14,
      rows: 1,
      heightPct: 72,
      aspectRatio: 1.333,
      tileGapPx: 1,
    });
    const expectedHeight = ((500 - 13 * 1) * 1.333) / 14;
    expect(result.tileHeightPx).toBeCloseTo(expectedHeight, 6);
    expect(result.tileWidthPx).toBeCloseTo(expectedHeight / 1.333, 6);
  });
});
