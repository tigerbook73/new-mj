import { expect, test } from "vitest";
import { scoreJunkHand } from "./scoring.ts";

test("junk scoring stacks dealer, gangkai, qingyise, pengpenghu and menqing", () => {
  expect(
    scoreJunkHand({
      hand: ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "4m", "4m", "4m", "5m", "5m"],
      melds: [],
      isDealer: true,
      winType: "zimo",
      gangChainLength: 2,
    }),
  ).toEqual({
    fanTypes: ["dealer", "gangkai", "qingYise", "pengpenghu", "menqing"],
    multiplier: 128,
  });
});

test("junk scoring distinguishes hunyise and seven pairs", () => {
  expect(
    scoreJunkHand({
      hand: ["1m", "1m", "2m", "2m", "3m", "3m", "4m", "4m", "5m", "5m", "1z", "1z", "2z", "2z"],
      melds: [],
      isDealer: false,
      winType: "ron",
      gangChainLength: 3,
    }),
  ).toEqual({ fanTypes: ["hunYise", "qixiaodui", "menqing"], multiplier: 8 });
});
