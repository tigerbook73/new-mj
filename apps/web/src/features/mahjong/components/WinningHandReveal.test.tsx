import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WinningHandReveal } from "./WinningHandReveal";

describe("WinningHandReveal", () => {
  it("highlights the winTile with the noteworthy-tile ring", () => {
    const markup = renderToStaticMarkup(
      createElement(WinningHandReveal, {
        groups: [
          ["1m", "2m", "3m"],
          ["9s", "9s"],
        ],
        winTile: "2m",
      }),
    );
    const images = [...markup.matchAll(/<img[^>]*alt="([^"]+)"[^>]*class="([^"]*)"/g)];
    expect(images).toHaveLength(5);
    for (const [, alt, className] of images) {
      expect(className!.includes("ring-red-500")).toBe(alt === "2m");
    }
  });

  it("highlights only the first occurrence when the winTile's kind repeats", () => {
    const markup = renderToStaticMarkup(
      createElement(WinningHandReveal, {
        groups: [["9s", "9s"]],
        winTile: "9s",
      }),
    );
    const highlightedCount = (markup.match(/ring-red-500/g) ?? []).length;
    expect(highlightedCount).toBe(1);
  });

  it("highlights nothing when winTile is omitted (e.g. bloodbattle, not wired yet)", () => {
    const markup = renderToStaticMarkup(
      createElement(WinningHandReveal, {
        groups: [["1m", "2m", "3m"]],
      }),
    );
    expect(markup).not.toContain("ring-red-500");
  });

  it("prefers the winTile ring over the caishen ring when a tile is both (cn's tailwind-merge keeps only the later ring-color utility — there's no way to stack two ring colors on one box-shadow-based ring)", () => {
    const markup = renderToStaticMarkup(
      createElement(WinningHandReveal, {
        groups: [["1z", "5z"]],
        winTile: "5z",
      }),
    );
    const images = [...markup.matchAll(/<img[^>]*alt="5z"[^>]*class="([^"]*)"/g)];
    expect(images).toHaveLength(1);
    expect(images[0]![1]).toContain("ring-red-500");
    expect(images[0]![1]).not.toContain("ring-amber-400");
  });
});
