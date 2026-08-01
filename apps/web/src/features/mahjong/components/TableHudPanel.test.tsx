import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableHudPanel } from "./TableHudPanel";

const baseProps = {
  rulesetId: "hangzhou",
  roomName: "Table 1",
  gameNumber: 2,
  totalGames: 8,
  dealer: 1,
  scores: [900, 1200, 1000, 900],
  players: [
    {
      userId: "u0",
      seatId: 0,
      nickname: "Alice",
      isBot: false,
      isReady: true,
      isAutoPiloted: false,
      isDisconnected: false,
    },
    {
      userId: "u1",
      seatId: 1,
      nickname: "Bob",
      avatar: "https://example.com/bob.png",
      isBot: false,
      isReady: true,
      isAutoPiloted: false,
      isDisconnected: false,
    },
    null,
    null,
  ] as const,
  onLeave: () => {},
  volume: 0.6,
  muted: false,
  onVolumeChange: () => {},
  onToggleMuted: () => {},
};

describe("TableHudPanel", () => {
  it("shows the Chinese ruleset label and room name on one line", () => {
    const markup = renderToStaticMarkup(createElement(TableHudPanel, baseProps));
    expect(markup).toContain("杭州麻将 · Table 1");
  });

  it("shows the game count", () => {
    const markup = renderToStaticMarkup(createElement(TableHudPanel, baseProps));
    expect(markup).toContain("Game 2/8");
  });

  it("shows each player's nickname, dealer marker, and score, with fallbacks for empty seats", () => {
    const markup = renderToStaticMarkup(createElement(TableHudPanel, baseProps));
    expect(markup).toContain(">AL<");
    expect(markup).toContain('src="https://example.com/bob.png"');
    expect(markup).toContain("Bob · Dealer");
    expect(markup).not.toContain("Alice · Dealer");
    expect(markup).toContain("1200 points");
    expect(markup).toContain("Seat 3");
  });

  it("shows the reserved rules link as inert (no target page yet)", () => {
    const markup = renderToStaticMarkup(createElement(TableHudPanel, baseProps));
    expect(markup).toContain("玩法规则");
    expect(markup).toContain('aria-disabled="true"');
  });

  it("always renders the Leave room trigger", () => {
    const markup = renderToStaticMarkup(createElement(TableHudPanel, baseProps));
    expect(markup).toContain("Leave room");
  });

  it("renders a mute toggle and volume slider reflecting the current settings", () => {
    const markup = renderToStaticMarkup(
      createElement(TableHudPanel, { ...baseProps, volume: 0.3 }),
    );
    expect(markup).toContain('aria-label="Mute sound"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('type="range"');
    expect(markup).toContain('value="0.3"');
  });

  it("shows the unmute label and disables the slider once muted", () => {
    const markup = renderToStaticMarkup(
      createElement(TableHudPanel, { ...baseProps, muted: true }),
    );
    expect(markup).toContain('aria-label="Unmute sound"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('disabled=""');
  });
});
