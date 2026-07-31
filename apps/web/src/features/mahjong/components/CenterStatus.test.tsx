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
