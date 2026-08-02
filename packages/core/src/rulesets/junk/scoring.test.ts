import { expect, test } from "vitest";
import { scoreJunkHand } from "./scoring.ts";

test("junk scoring stacks gangkai, qingyise, pengpenghu and menqing", () => {
  expect(
    scoreJunkHand({
      family: "standard",
      groups: [
        ["1m", "1m", "1m"],
        ["2m", "2m", "2m"],
        ["3m", "3m", "3m"],
        ["4m", "4m", "4m"],
        ["5m", "5m"],
      ],
      melds: [],
      win: { by: "zimo" },
      gangChainLength: 2,
    }),
  ).toEqual({
    fanTypes: ["pengpenghu", "menqing", "qingyise", "gangkai"],
    multiplier: 64,
  });
});

test("junk scoring distinguishes hunyise and seven pairs", () => {
  expect(
    scoreJunkHand({
      family: "sevenPairs",
      groups: [
        ["1m", "1m"],
        ["2m", "2m"],
        ["3m", "3m"],
        ["4m", "4m"],
        ["5m", "5m"],
        ["1z", "1z"],
        ["2z", "2z"],
      ],
      melds: [],
      win: { by: "ron" },
      gangChainLength: 3,
    }),
  ).toEqual({ fanTypes: ["qidui", "menqing", "hunyise"], multiplier: 8 });
});
