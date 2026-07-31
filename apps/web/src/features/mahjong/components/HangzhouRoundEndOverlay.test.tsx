import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RoomInfo } from "@new-mj/protocol";
import { HangzhouRoundEndOverlay } from "./HangzhouRoundEndOverlay";

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
  gameNumber: 2,
  totalGames: 4,
  players,
  onConfirm: () => undefined,
  onEnd: () => undefined,
  entering: false,
  reducedMotion: true,
};

describe("HangzhouRoundEndOverlay", () => {
  it("translates fanTypes to Chinese labels and shows the multiplier", () => {
    const markup = renderToStaticMarkup(
      createElement(HangzhouRoundEndOverlay, {
        ...baseProps,
        myConfirmed: false,
        result: {
          type: "win",
          winner: 0,
          winners: [{ seat: 0, fanTypes: ["baotou", "gangkai"], multiplier: 4, payout: 4 }],
          winType: "zimo",
          scoreDeltas: [12, -4, -4, -4],
        },
      }),
    );

    expect(markup).toContain("Alice won by self-draw");
    expect(markup).toContain("爆头 + 杠开");
    expect(markup).toContain("(×4)");
  });

  it("names the discarder for a ron win", () => {
    const markup = renderToStaticMarkup(
      createElement(HangzhouRoundEndOverlay, {
        ...baseProps,
        myConfirmed: false,
        result: {
          type: "win",
          winner: 1,
          winners: [{ seat: 1, fanTypes: ["pinghu"], multiplier: 1, payout: 1 }],
          winType: "ron",
          from: 0,
          scoreDeltas: [-1, 1, 0, 0],
        },
      }),
    );

    expect(markup).toContain("Bob won off Alice&#x27;s discard");
    expect(markup).toContain("平胡");
  });

  it("renders a draw without a winners list", () => {
    const markup = renderToStaticMarkup(
      createElement(HangzhouRoundEndOverlay, {
        ...baseProps,
        myConfirmed: true,
        result: { type: "draw", scoreDeltas: [0, 0, 0, 0] },
      }),
    );

    expect(markup).toContain("Round drawn");
    expect(markup).not.toContain("won by self-draw");
    expect(markup).not.toContain("won off");
  });

  it("falls back to the raw code for an unrecognized fanType, instead of hiding it", () => {
    const markup = renderToStaticMarkup(
      createElement(HangzhouRoundEndOverlay, {
        ...baseProps,
        myConfirmed: false,
        result: {
          type: "win",
          winner: 0,
          winners: [{ seat: 0, fanTypes: ["someFutureFanType"], multiplier: 2, payout: 2 }],
          winType: "zimo",
          scoreDeltas: [6, -2, -2, -2],
        },
      }),
    );

    expect(markup).toContain("someFutureFanType");
  });
});
