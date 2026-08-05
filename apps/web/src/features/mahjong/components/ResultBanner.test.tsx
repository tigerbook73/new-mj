import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResultBanner } from "./ResultBanner";

describe("ResultBanner", () => {
  it("shows 流局 for a draw", () => {
    const markup = renderToStaticMarkup(
      createElement(ResultBanner, {
        result: { type: "draw", scoreDeltas: [0, 0, 0, 0] },
        reducedMotion: false,
      }),
    );
    expect(markup).toContain(">流局<");
  });

  it("shows 自摸！ for a self-drawn win", () => {
    const markup = renderToStaticMarkup(
      createElement(ResultBanner, {
        result: {
          type: "win",
          winner: 0,
          winners: [0],
          winType: "zimo",
          scoreDeltas: [3, -1, -1, -1],
        },
        reducedMotion: false,
      }),
    );
    expect(markup).toContain(">自摸！<");
  });

  it("shows 胡了！ for a ron win", () => {
    const markup = renderToStaticMarkup(
      createElement(ResultBanner, {
        result: {
          type: "win",
          winner: 1,
          winners: [1],
          winType: "ron",
          from: 0,
          scoreDeltas: [-3, 3, 0, 0],
        },
        reducedMotion: false,
      }),
    );
    expect(markup).toContain(">胡了！<");
  });

  it("carries a testid so TableView can coordinate it under AnimatePresence", () => {
    const markup = renderToStaticMarkup(
      createElement(ResultBanner, {
        result: { type: "draw", scoreDeltas: [0, 0, 0, 0] },
        reducedMotion: true,
      }),
    );
    expect(markup).toContain('data-testid="result-banner"');
  });
});
