import { describe, expect, it } from "vitest";
import {
  DEFAULT_TABLE_LAYOUT_CONFIG,
  normalizeTableLayoutConfig,
  readTableLayoutConfig,
  TABLE_LAYOUT_STORAGE_KEY,
} from "./tableLayoutLab";

describe("table layout lab config", () => {
  it("returns a detached default for missing and invalid saved values", () => {
    const missing = readTableLayoutConfig({ getItem: () => null });
    const invalid = readTableLayoutConfig({ getItem: () => "{" });
    expect(missing).toEqual(DEFAULT_TABLE_LAYOUT_CONFIG);
    expect(invalid).toEqual(DEFAULT_TABLE_LAYOUT_CONFIG);
    expect(missing).not.toBe(DEFAULT_TABLE_LAYOUT_CONFIG);
  });

  it("rejects an unknown schema version", () => {
    const storage = {
      getItem: (key: string) => (key === TABLE_LAYOUT_STORAGE_KEY ? '{"version":2}' : null),
    };
    expect(readTableLayoutConfig(storage)).toEqual(DEFAULT_TABLE_LAYOUT_CONFIG);
  });

  it("clamps numbers and ignores unknown fields", () => {
    const normalized = normalizeTableLayoutConfig({
      version: 1,
      hand: { tileHeightPct: 999, unknown: 1 },
      meldInfo: { meldHeightPct: 999, meldTileHeightPct: 0 },
      discard: { columns: 2.2, rows: 99 },
      debug: { showRegions: "yes" },
    });
    expect(normalized.hand.tileHeightPct).toBe(80);
    expect(normalized.meldInfo.meldHeightPct).toBe(100);
    expect(normalized.meldInfo.meldTileHeightPct).toBe(5);
    expect(normalized.discard.columns).toBe(4);
    expect(normalized.discard.rows).toBe(4);
    expect(normalized.debug.showRegions).toBe(false);
    expect(normalized).not.toHaveProperty("unknown");
  });

  it("accepts the legacy percentage tile gap as a pixel fallback", () => {
    const normalized = normalizeTableLayoutConfig({
      version: 1,
      tiles: { tileGapPct: 2 },
    });
    expect(normalized.tiles.tileGapPx).toBe(2);
    expect(normalized.tiles).not.toHaveProperty("tileGapPct");
  });
});
