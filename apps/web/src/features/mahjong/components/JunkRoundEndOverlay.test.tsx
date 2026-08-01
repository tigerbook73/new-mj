import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RoomInfo } from "@new-mj/protocol";
import { JunkRoundEndOverlay } from "./JunkRoundEndOverlay";

const players: RoomInfo["players"] = [
  {
    userId: "1",
    seatId: 0,
    nickname: "Alice",
    isBot: false,
    isReady: true,
    isAutoPiloted: false,
    isDisconnected: false,
  },
  {
    userId: "2",
    seatId: 1,
    nickname: "Bob",
    isBot: false,
    isReady: false,
    isAutoPiloted: false,
    isDisconnected: false,
  },
  null,
  null,
];

const baseProps = {
  result: { type: "draw" as const, scoreDeltas: [0, 0, 0, 0] as [number, number, number, number] },
  gameNumber: 2,
  totalGames: 4,
  players,
  onConfirm: () => undefined,
  onEnd: () => undefined,
  entering: false,
  reducedMotion: true,
};

describe("JunkRoundEndOverlay", () => {
  it("renders an End session action alongside Next round when not yet confirmed", () => {
    const markup = renderToStaticMarkup(
      createElement(JunkRoundEndOverlay, { ...baseProps, myConfirmed: false }),
    );

    expect(markup).toContain(">Next round<");
    expect(markup).toContain(">End session<");
  });

  it("still renders End session once the caller has already confirmed next round", () => {
    const markup = renderToStaticMarkup(
      createElement(JunkRoundEndOverlay, { ...baseProps, myConfirmed: true }),
    );

    // Any seated player may end the session early, confirmed or not
    // (session-mechanics.md §6) — the button must not disappear once this
    // seat has already clicked "Next round".
    expect(markup).toContain(">End session<");
    expect(markup).not.toContain(">Next round<");
  });

  it("renders Junk v3 fan labels and multiplier from the server result", () => {
    const markup = renderToStaticMarkup(
      createElement(JunkRoundEndOverlay, {
        ...baseProps,
        myConfirmed: false,
        result: {
          type: "win",
          winner: 0,
          winners: [
            { seat: 0, fanTypes: ["dealer", "qingYise", "menqing"], multiplier: 16, payout: 16 },
          ],
          winType: "zimo",
          scoreDeltas: [48, -16, -16, -16],
        },
      }),
    );
    expect(markup).toContain("庄家胡 · 清一色 · 门清 ×16");
    expect(markup).toContain("Alice won by self-draw.");
  });

  it("names the discarder for a ron win", () => {
    const markup = renderToStaticMarkup(
      createElement(JunkRoundEndOverlay, {
        ...baseProps,
        myConfirmed: false,
        result: {
          type: "win",
          winner: 1,
          winners: [{ seat: 1, fanTypes: ["pengpenghu"], multiplier: 2, payout: 2 }],
          winType: "ron",
          from: 0,
          scoreDeltas: [-2, 2, 0, 0],
        },
      }),
    );
    expect(markup).toContain("Bob won off Alice&#x27;s discard.");
    expect(markup).toContain("碰碰胡 ×2");
  });
});
