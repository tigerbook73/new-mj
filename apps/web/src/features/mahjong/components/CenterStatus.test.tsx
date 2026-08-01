import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CenterStatus } from "./CenterStatus";

describe("CenterStatus phase label", () => {
  it("maps known phase values to their Chinese label", () => {
    const cases: Array<[string, string]> = [
      ["dealing", "发牌中"],
      ["exchanging", "换三张"],
      ["choosing-lack", "定缺中"],
      ["playing", "进行中"],
      ["awaiting-claims", "待响应"],
      ["awaiting-draw", "摸牌中"],
      ["finished", "已结束"],
    ];
    for (const [phase, label] of cases) {
      const markup = renderToStaticMarkup(createElement(CenterStatus, { phase, wallCount: 40 }));
      expect(markup).toContain(`>${label}<`);
    }
  });

  it("falls back to the raw string for an unrecognized phase", () => {
    const markup = renderToStaticMarkup(
      createElement(CenterStatus, { phase: "some-future-phase", wallCount: 40 }),
    );
    expect(markup).toContain(">some-future-phase<");
  });
});

describe("CenterStatus wall count", () => {
  it("renders the count as the hero number with a 张 unit", () => {
    const markup = renderToStaticMarkup(
      createElement(CenterStatus, { phase: "playing", wallCount: 68 }),
    );
    expect(markup).toContain(">68<");
    expect(markup).toContain(">张<");
  });
});

describe("CenterStatus dealer streak chip", () => {
  it("shows the raw streak count whenever dealerStreak is defined, even past the santiao unlock threshold", () => {
    const before = renderToStaticMarkup(
      createElement(CenterStatus, { phase: "playing", wallCount: 40, dealerStreak: 1 }),
    );
    expect(before).toContain('data-testid="dealer-streak-chip"');
    expect(before).toContain("连庄 1");

    const after = renderToStaticMarkup(
      createElement(CenterStatus, { phase: "playing", wallCount: 40, dealerStreak: 5 }),
    );
    expect(after).toContain("连庄 5");
  });

  it("is absent when dealerStreak is undefined (junk/bloodbattle)", () => {
    const markup = renderToStaticMarkup(
      createElement(CenterStatus, { phase: "playing", wallCount: 40 }),
    );
    expect(markup).not.toContain('data-testid="dealer-streak-chip"');
  });
});

describe("CenterStatus badges", () => {
  it("renders whatever badge list it's given, in order, with no ruleset-specific logic of its own", () => {
    const markup = renderToStaticMarkup(
      createElement(CenterStatus, {
        phase: "playing",
        wallCount: 40,
        badges: [
          { key: "a", label: "听牌", icon: null, className: "text-sky-600" },
          { key: "b", label: "财飘", icon: null, className: "text-rose-600" },
        ],
      }),
    );
    expect(markup).toContain('data-testid="status-badges"');
    expect(markup).toContain(">听牌<");
    expect(markup).toContain(">财飘<");
  });

  it("omits the badge row entirely when the list is empty or absent", () => {
    const empty = renderToStaticMarkup(
      createElement(CenterStatus, { phase: "playing", wallCount: 40, badges: [] }),
    );
    expect(empty).not.toContain('data-testid="status-badges"');

    const absent = renderToStaticMarkup(
      createElement(CenterStatus, { phase: "playing", wallCount: 40 }),
    );
    expect(absent).not.toContain('data-testid="status-badges"');
  });
});
