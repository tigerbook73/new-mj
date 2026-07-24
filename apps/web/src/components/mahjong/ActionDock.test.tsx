import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionDock } from "./ActionDock";

describe("ActionDock", () => {
  it("shows non-discard legal actions and leaves discard selection on the hand", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionDock, {
        hand: [77, 78],
        actions: [{ type: "discard", tile: 1 }, { type: "peng" }, { type: "pass" }],
        recommendedAction: { type: "pass" },
        lastDiscard: 76,
        deadline: Date.now() + 5_000,
        error: "ILLEGAL_ACTION",
        onAction: () => undefined,
      }),
    );

    expect(markup).toContain('data-testid="action-dock"');
    expect(markup).toContain(">碰<");
    expect(markup).toContain(">过 · 推荐<");
    expect(markup).toContain("text-foreground");
    expect(markup).not.toContain(">discard<");
    expect(markup).not.toContain(">pass<");
    expect(markup).toContain("推荐");
    expect(markup).toContain("16cqb");
    expect(markup).toContain("8cqi");
    expect(markup).toContain('data-testid="action-deadline"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("ILLEGAL_ACTION");
    expect(markup).toContain('data-tile-id="76"');
  });

  it("sorts chi candidates by tile face and highlights the discarded target", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionDock, {
        hand: [2, 9],
        actions: [{ type: "chi", tiles: [2, 9] }],
        lastDiscard: 4,
        onAction: () => undefined,
      }),
    );

    expect(markup).toMatch(/data-tile-id="2"[\s\S]*data-tile-id="4"[\s\S]*data-tile-id="9"/);
    expect(markup).toContain('data-testid="action-target-tile"');
  });

  it("uses the just-drawn tile for a zimo candidate", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionDock, {
        hand: [68],
        actions: [{ type: "zimo" }],
        justDrawn: 68,
        onAction: () => undefined,
      }),
    );

    expect(markup).toContain(">自摸<");
    expect(markup).toContain('data-tile-id="68"');
    expect(markup).toContain('data-testid="action-candidates"');
  });

  it("reserves the hu candidate area without revealing its discard before hover", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionDock, {
        hand: [],
        actions: [{ type: "hu" }, { type: "pass" }],
        recommendedAction: { type: "hu" },
        lastDiscard: 76,
        onAction: () => undefined,
      }),
    );

    expect(markup).toContain('data-testid="action-candidates"');
    expect(markup).not.toContain('data-tile-id="76"');
  });

  it("shows matching hand tiles before the target for peng and minGang", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionDock, {
        hand: [17, 18, 19],
        actions: [{ type: "peng" }, { type: "minGang" }],
        recommendedAction: { type: "peng" },
        lastDiscard: 16,
        onAction: () => undefined,
      }),
    );

    expect(markup).toMatch(/data-tile-id="17"[\s\S]*data-tile-id="18"[\s\S]*data-tile-id="16"/);
    expect(markup).toContain('data-testid="action-target-tile"');
  });

  it("shows all concealed kong tiles and the meld extended by buGang", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionDock, {
        hand: [16, 17, 18, 19, 68],
        melds: [{ type: "peng", tiles: [69, 70, 71] }],
        actions: [
          { type: "anGang", kind: "5m" },
          { type: "buGang", tile: 68 },
        ],
        recommendedAction: { type: "anGang", kind: "5m" },
        onAction: () => undefined,
      }),
    );

    expect(markup).toMatch(/data-tile-id="16"[\s\S]*17[\s\S]*18[\s\S]*19/);
  });
});
