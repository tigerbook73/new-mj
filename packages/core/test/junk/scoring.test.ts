import { expect, test } from "vitest";
import { scoreJunkHand } from "../../src/index.ts";
import type { JunkScoringInput, JunkScoringMeld, JunkScoringResult, TileKind } from "../../src/index.ts";

type JunkScoringCase = {
  id: string;
  desc: string;
  input: JunkScoringInput;
  expect: JunkScoringResult;
};

// A plain standard-family win: one open peng (breaks menqing, and isn't a
// chi so it wouldn't itself block 碰碰胡 — the concealed run does that
// instead) plus mixed suits (blocks 混一色/清一色). No fan should fire.
const plainGroups: TileKind[][] = [
  ["1m", "2m", "3m"],
  ["4p", "4p", "4p"],
  ["7s", "7s"],
];
const plainMelds: JunkScoringMeld[] = [{ type: "peng", tiles: ["9s", "9s", "9s"] }];

export const junkScoringFixtures: JunkScoringCase[] = [
  {
    id: "jk-001",
    desc: "平胡·点炮（无番）",
    input: {
      family: "standard",
      groups: plainGroups,
      melds: plainMelds,
      win: { by: "ron" },
      gangChainLength: 0,
    },
    expect: { fanTypes: [], multiplier: 1 },
  },
  {
    id: "jk-002",
    desc: "杠开（连杠链长 1，仅自摸生效）",
    input: {
      family: "standard",
      groups: plainGroups,
      melds: plainMelds,
      win: { by: "zimo" },
      gangChainLength: 1,
    },
    expect: { fanTypes: ["gangkai"], multiplier: 2 },
  },
  {
    id: "jk-003",
    desc: "连续杠开（连杠链长 2）",
    input: {
      family: "standard",
      groups: plainGroups,
      melds: plainMelds,
      win: { by: "zimo" },
      gangChainLength: 2,
    },
    expect: { fanTypes: ["gangkai"], multiplier: 4 },
  },
  {
    id: "jk-004",
    desc: "点炮忽略连杠链长（区分例：同样 gangChainLength=3，但 by=ron 不计杠开）",
    input: {
      family: "standard",
      groups: plainGroups,
      melds: plainMelds,
      win: { by: "ron" },
      gangChainLength: 3,
    },
    expect: { fanTypes: [], multiplier: 1 },
  },
  {
    id: "jk-005",
    desc: "自摸但连杠链长为 0（边界：不触发杠开）",
    input: {
      family: "standard",
      groups: plainGroups,
      melds: plainMelds,
      win: { by: "zimo" },
      gangChainLength: 0,
    },
    expect: { fanTypes: [], multiplier: 1 },
  },
  {
    id: "jk-006",
    desc: "混一色（一种花色+字牌，非门清）",
    input: {
      family: "standard",
      groups: [
        ["1m", "2m", "3m"],
        ["4m", "4m", "4m"],
        ["1z", "1z"],
      ],
      melds: [{ type: "peng", tiles: ["5m", "5m", "5m"] }],
      win: { by: "ron" },
      gangChainLength: 0,
    },
    expect: { fanTypes: ["hunyise"], multiplier: 2 },
  },
  {
    id: "jk-007",
    desc: "清一色（单一花色不含字牌，与混一色互斥）",
    input: {
      family: "standard",
      groups: [
        ["1m", "2m", "3m"],
        ["4m", "4m", "4m"],
        ["7m", "7m"],
      ],
      melds: [{ type: "peng", tiles: ["5m", "5m", "5m"] }],
      win: { by: "ron" },
      gangChainLength: 0,
    },
    expect: { fanTypes: ["qingyise"], multiplier: 4 },
  },
  {
    id: "jk-008",
    desc: "7 对（family=sevenPairs 恒无副露，门清天然一起生效）",
    input: {
      family: "sevenPairs",
      groups: [
        ["1m", "1m"],
        ["2m", "2m"],
        ["3p", "3p"],
        ["4p", "4p"],
        ["5s", "5s"],
        ["6s", "6s"],
        ["1z", "1z"],
      ],
      melds: [],
      win: { by: "ron" },
      gangChainLength: 0,
    },
    expect: { fanTypes: ["qidui", "menqing"], multiplier: 4 },
  },
  {
    id: "jk-009",
    desc: "碰碰胡（4 副刻子+将，其中一副是已声明的碰，不破碰碰胡但破门清）",
    input: {
      family: "standard",
      groups: [
        ["4m", "4m", "4m"],
        ["5p", "5p", "5p"],
        ["6s", "6s", "6s"],
        ["7z", "7z"],
      ],
      melds: [{ type: "peng", tiles: ["1s", "1s", "1s"] }],
      win: { by: "ron" },
      gangChainLength: 0,
    },
    expect: { fanTypes: ["pengpenghu"], multiplier: 2 },
  },
  {
    id: "jk-010",
    desc: "碰碰胡+门清叠加（无任何已声明副露）",
    input: {
      family: "standard",
      groups: [
        ["4m", "4m", "4m"],
        ["5p", "5p", "5p"],
        ["6s", "6s", "6s"],
        ["7z", "7z"],
      ],
      melds: [],
      win: { by: "ron" },
      gangChainLength: 0,
    },
    expect: { fanTypes: ["pengpenghu", "menqing"], multiplier: 4 },
  },
  {
    id: "jk-011",
    desc: "全叠加：碰碰胡×门清×清一色×杠开（对应 test/junk/engine.test.ts 的杠上自摸场景，交叉验证）",
    input: {
      family: "standard",
      groups: [
        ["2m", "2m", "2m"],
        ["3m", "3m", "3m"],
        ["4m", "4m", "4m"],
        ["5m", "5m"],
      ],
      melds: [{ type: "anGang", tiles: ["1m", "1m", "1m", "1m"] }],
      win: { by: "zimo" },
      gangChainLength: 1,
    },
    expect: { fanTypes: ["pengpenghu", "menqing", "qingyise", "gangkai"], multiplier: 32 },
  },
];

test.each(junkScoringFixtures)("$id $desc", (fixture) => {
  expect(scoreJunkHand(fixture.input)).toEqual(fixture.expect);
});
