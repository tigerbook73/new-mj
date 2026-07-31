import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RoomInfo } from "@new-mj/protocol";
import { RoundEndOverlay } from "./RoundEndOverlay";

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

describe("RoundEndOverlay", () => {
  it("renders an End session action alongside Next round when not yet confirmed", () => {
    const markup = renderToStaticMarkup(
      createElement(RoundEndOverlay, { ...baseProps, myConfirmed: false }),
    );

    expect(markup).toContain(">Next round<");
    expect(markup).toContain(">End session<");
  });

  it("still renders End session once the caller has already confirmed next round", () => {
    const markup = renderToStaticMarkup(
      createElement(RoundEndOverlay, { ...baseProps, myConfirmed: true }),
    );

    // Any seated player may end the session early, confirmed or not
    // (session-mechanics.md §6) — the button must not disappear once this
    // seat has already clicked "Next round".
    expect(markup).toContain(">End session<");
    expect(markup).not.toContain(">Next round<");
  });
});
