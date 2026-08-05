import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_TABLE_LAYOUT_CONFIG } from "@/features/mahjong/lib/tableLayoutConfig";
import { MeldGroup, type Meld } from "./MeldGroup";

function renderMelds(melds: Meld[]): string {
  return renderToStaticMarkup(
    createElement(MeldGroup, {
      direction: "bottom",
      melds,
      tileHeight: 100,
      config: DEFAULT_TABLE_LAYOUT_CONFIG,
    }),
  );
}

describe("MeldGroup", () => {
  it("shows one real face plus three backs for the owner's own anGang", () => {
    // Self view carries all 4 real TileIds (see core's PlayerView concealment
    // rule) — display convention still only reveals one of them.
    const markup = renderMelds([
      { type: "anGang", tiles: [11, 12, 13, 14], meldLedgerKey: "g1:meld:0:0:4" },
    ]);

    expect(markup).toContain('data-tile-id="11"');
    expect(markup).not.toContain('data-tile-id="12"');
    expect(markup).not.toContain('data-tile-id="13"');
    expect(markup).not.toContain('data-tile-id="14"');
    // 4 tile faces total: 1 revealed (non-empty alt) + 3 face-down backs (empty alt).
    expect(markup.match(/<img /g)).toHaveLength(4);
    expect(markup.match(/alt=""/g)).toHaveLength(3);
    expect(markup).toContain('alt="11"');
  });

  it("shows four backs and leaks no TileId for another seat's anGang", () => {
    // Non-owner PlayerView redacts anGang tiles to [] — no real id ever
    // reaches this component for an opponent's concealed kong.
    const markup = renderMelds([{ type: "anGang", tiles: [], meldLedgerKey: "g1:meld:1:0:0" }]);

    expect(markup).not.toContain("data-tile-id=");
    expect(markup.match(/<img /g)).toHaveLength(4);
    expect(markup.match(/alt=""/g)).toHaveLength(4);
  });

  it("still renders all real faces for non-anGang meld types", () => {
    const markup = renderMelds([
      { type: "peng", tiles: [21, 22, 23], meldLedgerKey: "g1:meld:0:1:3" },
    ]);

    expect(markup).toContain('data-tile-id="21"');
    expect(markup).toContain('data-tile-id="22"');
    expect(markup).toContain('data-tile-id="23"');
  });
});
