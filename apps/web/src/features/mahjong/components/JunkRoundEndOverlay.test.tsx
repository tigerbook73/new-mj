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
  mySeat: 0,
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

    expect(markup).toContain(">下一局<");
    expect(markup).toContain(">结束<");
  });

  it("still renders End session once the caller has already confirmed next round", () => {
    const markup = renderToStaticMarkup(
      createElement(JunkRoundEndOverlay, { ...baseProps, myConfirmed: true }),
    );

    // Any seated player may end the session early, confirmed or not
    // (session-mechanics.md §6) — the button must not disappear once this
    // seat has already clicked "Next round".
    expect(markup).toContain(">结束<");
    expect(markup).not.toContain(">下一局<");
  });

  it("renders Junk v3 fan labels and multiplier from the server result", () => {
    const markup = renderToStaticMarkup(
      createElement(JunkRoundEndOverlay, {
        ...baseProps,
        myConfirmed: false,
        result: {
          type: "win",
          winner: 0,
          winners: [0],
          // gangkai ×2 · qingyise ×4 · menqing ×2 = 16; the dealer's flat ×2
          // is not a fan type (junk.md §3) and never appears in fanTypes.
          winnerDetails: [
            { seat: 0, fanTypes: ["gangkai", "qingyise", "menqing"], multiplier: 16, payout: 48 },
          ],
          winType: "zimo",
          scoreDeltas: [48, -16, -16, -16],
        },
      }),
    );
    expect(markup).toContain("我 自摸");
    expect(markup).toContain("庄家 ×2");
    expect(markup).toContain("清一色 ×4 · 门清 ×2（合计 ×16）");
  });

  it("names the discarder for a ron win", () => {
    const markup = renderToStaticMarkup(
      createElement(JunkRoundEndOverlay, {
        ...baseProps,
        myConfirmed: false,
        result: {
          type: "win",
          winner: 1,
          winners: [1],
          winnerDetails: [{ seat: 1, fanTypes: ["pengpenghu"], multiplier: 2, payout: 2 }],
          winType: "ron",
          from: 0,
          scoreDeltas: [-2, 2, 0, 0],
        },
      }),
    );
    expect(markup).toContain("Bob 胡牌（我 点炮）");
    expect(markup).toContain("碰碰胡 ×2");
  });

  it("uses the scorer's fixed-rule fan IDs for Chinese labels", () => {
    const markup = renderToStaticMarkup(
      createElement(JunkRoundEndOverlay, {
        ...baseProps,
        myConfirmed: false,
        result: {
          type: "win",
          winner: 0,
          winners: [0],
          // A seven-pairs hand is necessarily concealed, so qidui always comes
          // with menqing; qidui ×2 · menqing ×2 · hunyise ×2 = 8. Seat 1 is the
          // dealer here, so only that payment doubles (8 → 16).
          winnerDetails: [
            { seat: 0, fanTypes: ["qidui", "menqing", "hunyise"], multiplier: 8, payout: 32 },
          ],
          winType: "zimo",
          scoreDeltas: [32, -16, -8, -8],
        },
      }),
    );
    expect(markup).toContain("七小对 ×2 · 门清 ×2 · 混一色 ×2（合计 ×8）");
  });

  it("puts the winner's score first and calls the local player 我", () => {
    const markup = renderToStaticMarkup(
      createElement(JunkRoundEndOverlay, {
        ...baseProps,
        myConfirmed: false,
        result: {
          type: "win",
          winner: 1,
          winners: [1],
          winnerDetails: [{ seat: 1, fanTypes: ["pengpenghu"], multiplier: 2, payout: 2 }],
          winType: "ron",
          from: 0,
          scoreDeltas: [-2, 2, 0, 0],
        },
      }),
    );
    expect(markup.indexOf("Bob: +2")).toBeLessThan(markup.indexOf("我: -2"));
  });
});
