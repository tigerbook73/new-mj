import { expect, test } from "vitest";
import { scoreHangzhouHand } from "../../src/index.ts";
import type { HangzhouScoringInput, HangzhouScoringResult } from "../../src/index.ts";

type HangzhouScoringCase = {
  id: string;
  desc: string;
  input: HangzhouScoringInput;
  expect: HangzhouScoringResult;
};

const CAI = "5z" as const; // caishen (白板), see rulesets/hangzhou/constants.ts
const base = { baseScore: 1 };

// hand is the pre-win concealed hand; the complete hand for shape checking is
// hand + win.tile. caiPiaoCount/gangChainLength are the winner's accumulated
// state at the moment of winning — see docs/variants/hangzhou.md §4/§6.
export const hangzhouScoringFixtures: HangzhouScoringCase[] = [
  {
    id: "hz-001",
    desc: "平胡·点炮",
    input: {
      ...base,
      hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "2s", "3s"],
      melds: [],
      win: { tile: "1s", by: "ron" },
      caiPiaoCount: 0,
      gangChainLength: 0,
    },
    expect: { hu: true, fanTypes: ["pinghu"], multiplier: 1, payout: 1 },
  },
  {
    id: "hz-002",
    desc: "爆头·自摸（四刻+财神，任意一张都能胡）",
    input: {
      ...base,
      hand: ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "4m", "4m", "4m", CAI],
      melds: [],
      win: { tile: "9s", by: "zimo" },
      caiPiaoCount: 0,
      gangChainLength: 0,
    },
    expect: { hu: true, fanTypes: ["baotou"], multiplier: 2, payout: 2 },
  },
  {
    id: "hz-003",
    desc: "财飘（caiPiaoCount=1）",
    input: {
      ...base,
      hand: ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "4m", "4m", "4m", CAI],
      melds: [],
      win: { tile: "9s", by: "zimo" },
      caiPiaoCount: 1,
      gangChainLength: 0,
    },
    expect: { hu: true, fanTypes: ["caipiao"], multiplier: 4, payout: 4 },
  },
  {
    id: "hz-004",
    desc: "双财飘（caiPiaoCount=2）",
    input: {
      ...base,
      hand: ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "4m", "4m", "4m", CAI],
      melds: [],
      win: { tile: "9s", by: "zimo" },
      caiPiaoCount: 2,
      gangChainLength: 0,
    },
    expect: { hu: true, fanTypes: ["shuangCaipiao"], multiplier: 8, payout: 8 },
  },
  {
    id: "hz-005",
    desc: "三财飘（caiPiaoCount=3，边界）",
    input: {
      ...base,
      hand: ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "4m", "4m", "4m", CAI],
      melds: [],
      win: { tile: "9s", by: "zimo" },
      caiPiaoCount: 3,
      gangChainLength: 0,
    },
    expect: { hu: true, fanTypes: ["sanCaipiao"], multiplier: 16, payout: 16 },
  },
  {
    id: "hz-006",
    desc: "caiPiaoCount 超过 3 封顶在三财飘（区分例）",
    input: {
      ...base,
      hand: ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "4m", "4m", "4m", CAI],
      melds: [],
      win: { tile: "9s", by: "zimo" },
      caiPiaoCount: 5,
      gangChainLength: 0,
    },
    expect: { hu: true, fanTypes: ["sanCaipiao"], multiplier: 16, payout: 16 },
  },
  {
    id: "hz-007",
    desc: "七对子",
    input: {
      ...base,
      hand: ["1m", "1m", "2m", "2m", "3m", "3m", "4m", "4m", "5m", "5m", "6m", "6m", "1z"],
      melds: [],
      win: { tile: "1z", by: "ron" },
      caiPiaoCount: 0,
      gangChainLength: 0,
    },
    expect: { hu: true, fanTypes: ["qiduizi"], multiplier: 2, payout: 2 },
  },
  {
    id: "hz-008",
    desc: "豪华七对子（quadCount=1，真实四张）",
    input: {
      ...base,
      hand: ["1m", "1m", "1m", "2m", "2m", "3m", "3m", "4m", "4m", "5m", "5m", "6m", "6m"],
      melds: [],
      win: { tile: "1m", by: "ron" },
      caiPiaoCount: 0,
      gangChainLength: 0,
    },
    expect: { hu: true, fanTypes: ["haohuaQiduizi"], multiplier: 4, payout: 4 },
  },
  {
    id: "hz-009",
    desc: "双豪华七对子（quadCount=2）",
    input: {
      ...base,
      hand: ["1m", "1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "4m", "4m", "5m", "5m"],
      melds: [],
      win: { tile: "2m", by: "ron" },
      caiPiaoCount: 0,
      gangChainLength: 0,
    },
    expect: { hu: true, fanTypes: ["shuangHaohuaQiduizi"], multiplier: 8, payout: 8 },
  },
  {
    id: "hz-010",
    desc: "三豪华七对子（quadCount=3，边界：4 个不同种四张已超出 7 个位置，四豪华不存在）",
    input: {
      ...base,
      hand: ["1m", "1m", "1m", "1m", "2m", "2m", "2m", "2m", "3m", "3m", "3m", "3m", "4m"],
      melds: [],
      win: { tile: "4m", by: "ron" },
      caiPiaoCount: 0,
      gangChainLength: 0,
    },
    expect: { hu: true, fanTypes: ["sanHaohuaQiduizi"], multiplier: 16, payout: 16 },
  },
  {
    id: "hz-011",
    desc: "财神不能补出豪华的第四张（负例：其余 5 组用不同字牌，杜绝意外满足基本型）",
    input: {
      ...base,
      // Filler honors deliberately avoid 5z (=CAI) so they don't collide with it.
      hand: ["1m", "1m", "1m", CAI, "1z", "2z", "2z", "3z", "3z", "4z", "4z", "6z", "6z"],
      melds: [],
      win: { tile: "1z", by: "ron" },
      caiPiaoCount: 0,
      gangChainLength: 0,
    },
    expect: { hu: false, reason: "NOT_A_WINNING_SHAPE" },
  },
  {
    id: "hz-012",
    desc: "不成型的负例（既非基本型也非七对，reason 机器可读）",
    input: {
      ...base,
      hand: ["1m", "1m", "1m", "2m", "2m", "3m", "3m", "4m", "4m", "5m", "5m", "6m", "6m"],
      melds: [],
      win: { tile: "8m", by: "ron" },
      caiPiaoCount: 0,
      gangChainLength: 0,
    },
    expect: { hu: false, reason: "NOT_A_WINNING_SHAPE" },
  },
  {
    id: "hz-013",
    desc: "杠开（连杠链长 1）叠加平胡",
    input: {
      ...base,
      hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "2s", "3s"],
      melds: [],
      win: { tile: "1s", by: "zimo" },
      caiPiaoCount: 0,
      gangChainLength: 1,
    },
    expect: { hu: true, fanTypes: ["pinghu", "gangkai"], multiplier: 2, payout: 2 },
  },
  {
    id: "hz-014",
    desc: "二连杠",
    input: {
      ...base,
      hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "2s", "3s"],
      melds: [],
      win: { tile: "1s", by: "zimo" },
      caiPiaoCount: 0,
      gangChainLength: 2,
    },
    expect: { hu: true, fanTypes: ["pinghu", "erLianGang"], multiplier: 4, payout: 4 },
  },
  {
    id: "hz-015",
    desc: "四连杠（边界）",
    input: {
      ...base,
      hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "2s", "3s"],
      melds: [],
      win: { tile: "1s", by: "zimo" },
      caiPiaoCount: 0,
      gangChainLength: 4,
    },
    expect: { hu: true, fanTypes: ["pinghu", "siLianGang"], multiplier: 16, payout: 16 },
  },
  {
    id: "hz-016",
    desc: "连杠链长超过 4 封顶在四连杠（区分例）",
    input: {
      ...base,
      hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "2s", "3s"],
      melds: [],
      win: { tile: "1s", by: "zimo" },
      caiPiaoCount: 0,
      gangChainLength: 6,
    },
    expect: { hu: true, fanTypes: ["pinghu", "siLianGang"], multiplier: 16, payout: 16 },
  },
  {
    id: "hz-017",
    desc: "爆头+杠开 = 4 倍",
    input: {
      ...base,
      hand: ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "4m", "4m", "4m", CAI],
      melds: [],
      win: { tile: "9s", by: "zimo" },
      caiPiaoCount: 0,
      gangChainLength: 1,
    },
    expect: { hu: true, fanTypes: ["baotou", "gangkai"], multiplier: 4, payout: 4 },
  },
  {
    id: "hz-018",
    desc: "财飘+杠开 =「飘杠」8 倍",
    input: {
      ...base,
      hand: ["1m", "1m", "1m", "2m", "2m", "2m", "3m", "3m", "3m", "4m", "4m", "4m", CAI],
      melds: [],
      win: { tile: "9s", by: "zimo" },
      caiPiaoCount: 1,
      gangChainLength: 1,
    },
    expect: { hu: true, fanTypes: ["caipiao", "gangkai"], multiplier: 8, payout: 8 },
  },
  {
    id: "hz-019",
    desc: "杠链只对自摸生效，点炮忽略 gangChainLength（区分例）",
    input: {
      ...base,
      hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "1p", "2s", "3s"],
      melds: [],
      win: { tile: "1s", by: "ron" },
      caiPiaoCount: 0,
      gangChainLength: 3,
    },
    expect: { hu: true, fanTypes: ["pinghu"], multiplier: 1, payout: 1 },
  },
];

test.each(hangzhouScoringFixtures)("$id $desc", (fixture) => {
  expect(scoreHangzhouHand(fixture.input)).toEqual(fixture.expect);
});
