import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CenterStatus } from "./CenterStatus";

describe("CenterStatus", () => {
  it("renders no badges for junk/bloodbattle, which never send the hangzhou-only fields", () => {
    const markup = renderToStaticMarkup(
      createElement(CenterStatus, { phase: "playing", currentSeat: 0, wallCount: 40 }),
    );
    expect(markup).not.toContain('data-testid="hangzhou-status-badges"');
  });

  it("shows only 爆头, not 听牌, when both are true (爆头 implies 听牌)", () => {
    const markup = renderToStaticMarkup(
      createElement(CenterStatus, {
        phase: "playing",
        currentSeat: 0,
        wallCount: 40,
        isTingpai: true,
        isBaotou: true,
      }),
    );
    expect(markup).toContain('data-testid="hangzhou-status-badges"');
    expect(markup).toContain(">爆头<");
    expect(markup).not.toContain(">听牌<");
  });

  it("shows 听牌 alone when not baotou, and 财飘 independently alongside either", () => {
    const tingpaiOnly = renderToStaticMarkup(
      createElement(CenterStatus, {
        phase: "playing",
        currentSeat: 0,
        wallCount: 40,
        isTingpai: true,
        isBaotou: false,
      }),
    );
    expect(tingpaiOnly).toContain(">听牌<");
    expect(tingpaiOnly).not.toContain(">爆头<");

    const caipiaoWithBaotou = renderToStaticMarkup(
      createElement(CenterStatus, {
        phase: "playing",
        currentSeat: 0,
        wallCount: 40,
        isBaotou: true,
        isCaipiao: true,
      }),
    );
    expect(caipiaoWithBaotou).toContain(">爆头<");
    expect(caipiaoWithBaotou).toContain(">财飘<");
  });
});

describe("CenterStatus santiao hint", () => {
  it("shows games remaining while dealerStreak is below the santiao threshold", () => {
    const first = renderToStaticMarkup(
      createElement(CenterStatus, {
        phase: "playing",
        currentSeat: 0,
        wallCount: 40,
        dealerStreak: 1,
      }),
    );
    expect(first).toContain('data-testid="santiao-status"');
    expect(first).toContain("Santiao: 2 to unlock");

    const second = renderToStaticMarkup(
      createElement(CenterStatus, {
        phase: "playing",
        currentSeat: 0,
        wallCount: 40,
        dealerStreak: 2,
      }),
    );
    expect(second).toContain("Santiao: 1 to unlock");
  });

  it("hides the hint once dealerStreak reaches the unlock threshold, and when absent (non-hangzhou)", () => {
    const unlocked = renderToStaticMarkup(
      createElement(CenterStatus, {
        phase: "playing",
        currentSeat: 0,
        wallCount: 40,
        dealerStreak: 3,
      }),
    );
    expect(unlocked).not.toContain('data-testid="santiao-status"');

    const absent = renderToStaticMarkup(
      createElement(CenterStatus, { phase: "playing", currentSeat: 0, wallCount: 40 }),
    );
    expect(absent).not.toContain('data-testid="santiao-status"');
  });
});
