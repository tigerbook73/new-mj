import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_TABLE_LAYOUT_CONFIG } from "@/features/mahjong/lib/tableLayoutConfig";
import type { SeatDirection } from "@/features/mahjong/lib/seatLayout";
import type { SeatContent } from "../TableBoard";
import { InfoSlot } from "./desktopZoneComponents";

const baseSeat: SeatContent = {
  melds: [],
  handTiles: [],
  handTokenKeys: [],
  revealed: false,
  reflow: false,
  animateDraw: false,
  highlightCaishen: false,
  info: "Alice",
  isDealer: false,
  drawnSlotKey: "none",
  drawnSlotLedgerKey: "draw:0",
};

function renderInfoSlot(direction: SeatDirection, overrides: Partial<SeatContent> = {}): string {
  return renderToStaticMarkup(
    createElement(InfoSlot, {
      direction,
      seat: { ...baseSeat, ...overrides },
      config: DEFAULT_TABLE_LAYOUT_CONFIG,
    }),
  );
}

describe("InfoSlot", () => {
  it("shows the nickname for a non-own seat, no dealer badge when not dealer", () => {
    const markup = renderInfoSlot("top");
    expect(markup).toContain(">Alice<");
    expect(markup).not.toContain('data-testid="dealer-badge-top"');
  });

  it("stacks the dealer badge above the nickname, both left-aligned, for a non-own dealer seat", () => {
    const markup = renderInfoSlot("left", { isDealer: true });
    const badgeIndex = markup.indexOf('data-testid="dealer-badge-left"');
    const nameIndex = markup.indexOf(">Alice<");
    expect(badgeIndex).toBeGreaterThan(-1);
    expect(nameIndex).toBeGreaterThan(-1);
    // DOM/source order in a column flex is visual top-to-bottom order — badge
    // must come first to render above the name.
    expect(badgeIndex).toBeLessThan(nameIndex);
    expect(markup).toContain("items-start");
  });

  it("never shows the nickname for the player's own (bottom) seat, dealer or not", () => {
    expect(renderInfoSlot("bottom")).not.toContain(">Alice<");
    expect(renderInfoSlot("bottom", { isDealer: true })).not.toContain(">Alice<");
  });

  it("still shows the dealer badge on the player's own (bottom) seat when they're dealing", () => {
    const markup = renderInfoSlot("bottom", { isDealer: true });
    expect(markup).toContain('data-testid="dealer-badge-bottom"');
  });
});
