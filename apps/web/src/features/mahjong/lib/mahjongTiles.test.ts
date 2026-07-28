import { describe, expect, it } from "vitest";
import { sortTilesForDisplay, tileBackImageSrc, tileImageSrc } from "./mahjongTiles";

describe("tile asset paths", () => {
  it("uses Regular by default and supports the Black asset set", () => {
    expect(tileImageSrc(0)).toBe("/tiles/Regular/Man1.svg");
    expect(tileImageSrc(135, "Black")).toBe("/tiles/Black/Chun.svg");
    expect(tileBackImageSrc()).toBe("/tiles/Regular/Back.svg");
    expect(tileBackImageSrc("Black")).toBe("/tiles/Black/Back.svg");
  });
});

describe("sortTilesForDisplay", () => {
  it("orders suits and honors by their public tile kind order", () => {
    expect(sortTilesForDisplay([108, 72, 36, 0, 132, 104, 68, 32])).toEqual([
      0, 32, 36, 68, 72, 104, 108, 132,
    ]);
  });

  it("keeps copies of the same tile kind in their input order", () => {
    expect(sortTilesForDisplay([19, 16, 18, 17, 4])).toEqual([4, 19, 16, 18, 17]);
  });

  it("returns a new array without changing the input", () => {
    const input = [72, 0, 36] as const;
    const result = sortTilesForDisplay(input);
    expect(result).toEqual([0, 36, 72]);
    expect(result).not.toBe(input);
    expect(input).toEqual([72, 0, 36]);
  });

  it.each([-1, 136])("rejects invalid TileId %s", (tileId) => {
    expect(() => sortTilesForDisplay([tileId])).toThrow(`INVALID_TILE_ID: ${tileId}`);
  });
});
