import { expect, test } from "vitest";
import { scoreBloodbattleHand } from "@/index.ts";
import type { BloodbattleScoringInput, BloodbattleScoringResult } from "@/index.ts";

type BloodbattleScoringCase = {
  id: string;
  desc: string;
  input: BloodbattleScoringInput;
  expect: BloodbattleScoringResult;
};

const standard = { capFan: 4, selfDrawBonus: "addFan" as const };

// Tile-count convention (see docs/rules-bloodbattle.md "约定" and
// decisions.md BB2): `input.hand` is the *pre-win* concealed hand; the
// complete hand for shape checking is `hand` plus `win.tile`. A kong is
// always a 4-tile entry in `melds`, never bare copies in `hand` — except the
// seven-pairs family (bb-006), where a "pair" being four-of-a-kind is the
// variant's own definition. With N kongs, the total (melds + hand + win.tile)
// is 14 + N (each kong grants a replacement draw in real play).
export const bloodbattleScoringFixtures: BloodbattleScoringCase[] = [
  {
    id: "bb-001",
    desc: "平胡·点炮",
    input: {
      config: standard,
      hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "2p", "3p", "4p", "9p"],
      melds: [],
      lack: "s",
      win: { tile: "9p", by: "discard" },
    },
    expect: { hu: true, fanTypes: ["pinghu"], fan: 0, multiplier: 1 },
  },
  {
    id: "bb-002",
    desc: "清一色+根·自摸（文档自带例，暗杠记入 melds，手牌配平至 15 张）",
    input: {
      config: standard,
      melds: [{ type: "anGang", tiles: ["1m", "1m", "1m", "1m"] }],
      hand: ["2m", "3m", "4m", "5m", "6m", "7m", "8m", "8m", "9m", "9m"],
      lack: "p",
      win: { tile: "8m", by: "zimo" },
    },
    expect: {
      hu: true,
      fanTypes: ["pinghu", "qingyise", "gen", "zimo"],
      fan: 4,
      multiplier: 16,
      cappedAt: 4,
    },
  },
  {
    id: "bb-003",
    desc: "含缺门牌不可胡（负例）",
    input: {
      config: standard,
      hand: ["1m", "2m", "3m", "4p", "5p", "6p", "7p", "8p", "9p", "2s", "3s", "4s", "9s"],
      melds: [],
      lack: "m",
      win: { tile: "9s", by: "discard" },
    },
    expect: { hu: false, reason: "LACK_SUIT_PRESENT" },
  },
  {
    id: "bb-004",
    desc: "对对胡·点炮（4 刻子+对，两副露刻子+一副暗刻+一对）",
    input: {
      config: standard,
      melds: [
        { type: "peng", tiles: ["1m", "1m", "1m"] },
        { type: "peng", tiles: ["5m", "5m", "5m"] },
        { type: "peng", tiles: ["3p", "3p", "3p"] },
      ],
      hand: ["9p", "9p", "7p", "7p"],
      lack: "s",
      win: { tile: "7p", by: "discard" },
    },
    expect: { hu: true, fanTypes: ["duiduihu"], fan: 1, multiplier: 2 },
  },
  {
    id: "bb-005",
    desc: "七对·点炮（7 个对子，无根）",
    input: {
      config: standard,
      hand: ["1m", "1m", "3m", "3m", "5m", "5m", "7m", "7m", "2p", "2p", "4p", "4p", "6p"],
      melds: [],
      lack: "s",
      win: { tile: "6p", by: "discard" },
    },
    expect: { hu: true, fanTypes: ["qiduizi"], fan: 2, multiplier: 4 },
  },
  {
    id: "bb-006",
    desc: "龙七对·点炮（一组四张相同 6p×4；已含第一个根，不重复计根）",
    input: {
      config: standard,
      // 15 concealed pre-win + 1 win = 16 total: 6 real pairs + one quad
      // group (6p), the +2-tile-over-normal-14 accounting a concealed kong
      // implies — see the convention note above this fixture array.
      hand: [
        "1m",
        "1m",
        "3m",
        "3m",
        "5m",
        "5m",
        "7m",
        "7m",
        "2p",
        "2p",
        "4p",
        "4p",
        "6p",
        "6p",
        "6p",
      ],
      melds: [],
      lack: "s",
      win: { tile: "6p", by: "discard" },
    },
    expect: { hu: true, fanTypes: ["longqidui"], fan: 3, multiplier: 8 },
  },
  {
    id: "bb-007",
    desc: "金钩钓·点炮（四副露刻子，单钓一张）",
    input: {
      config: standard,
      melds: [
        { type: "peng", tiles: ["1m", "1m", "1m"] },
        { type: "peng", tiles: ["5m", "5m", "5m"] },
        { type: "peng", tiles: ["3p", "3p", "3p"] },
        { type: "peng", tiles: ["7p", "7p", "7p"] },
      ],
      hand: ["9p"],
      lack: "s",
      win: { tile: "9p", by: "discard" },
    },
    expect: { hu: true, fanTypes: ["jingoudiao"], fan: 1, multiplier: 2 },
  },
  {
    id: "bb-008",
    desc: "清一色（平胡底 + 清一色附加）",
    input: {
      config: standard,
      hand: ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "3p", "3p", "2p", "2p"],
      melds: [],
      lack: "s",
      win: { tile: "2p", by: "discard" },
    },
    expect: { hu: true, fanTypes: ["pinghu", "qingyise"], fan: 2, multiplier: 4 },
  },
  {
    id: "bb-009",
    desc: "根（副露明杠，非暗藏于手牌——避开 bb-002 的记法歧义）",
    input: {
      config: standard,
      melds: [{ type: "minGang", tiles: ["1m", "1m", "1m", "1m"] }],
      // meld(4) + hand(10) + win(1) = 15: one kong beyond the normal 14.
      hand: ["5m", "6m", "7m", "2p", "3p", "4p", "6p", "7p", "8p", "9p"],
      lack: "s",
      win: { tile: "9p", by: "discard" },
    },
    expect: { hu: true, fanTypes: ["pinghu", "gen"], fan: 1, multiplier: 2 },
  },
  {
    id: "bb-010",
    desc: "自摸（selfDrawBonus='addFan' 时自摸加 1 番）",
    input: {
      config: standard,
      hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "2p", "3p", "4p", "9p"],
      melds: [],
      lack: "s",
      win: { tile: "9p", by: "zimo" },
    },
    expect: { hu: true, fanTypes: ["pinghu", "zimo"], fan: 1, multiplier: 2 },
  },
  {
    id: "bb-011",
    desc: "自摸 config 分支：同一手牌，selfDrawBonus='addBase' 时自摸不加番",
    input: {
      config: { capFan: 4, selfDrawBonus: "addBase" },
      hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "2p", "3p", "4p", "9p"],
      melds: [],
      lack: "s",
      win: { tile: "9p", by: "zimo" },
    },
    expect: { hu: true, fanTypes: ["pinghu"], fan: 0, multiplier: 1 },
  },
  {
    id: "bb-012",
    desc: "杠上花（杠后补摸自摸；本质也是自摸，addFan 时 zimo 与 gangshanghua 同时计入，decisions.md BB2①）",
    input: {
      config: standard,
      hand: ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "2m", "3m", "4m", "9m"],
      melds: [],
      lack: "p",
      win: { tile: "9m", by: "kongFlower" },
    },
    expect: { hu: true, fanTypes: ["pinghu", "gangshanghua", "zimo"], fan: 2, multiplier: 4 },
  },
  {
    id: "bb-013",
    desc: "杠上炮（杠后补摸再弃牌被胡）",
    input: {
      config: standard,
      hand: ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "2m", "3m", "4m", "9m"],
      melds: [],
      lack: "p",
      win: { tile: "9m", by: "discard" },
      context: { afterKong: true },
    },
    expect: { hu: true, fanTypes: ["pinghu", "gangshangpao"], fan: 1, multiplier: 2 },
  },
  {
    id: "bb-014",
    desc: "抢杠胡（他家补杠时抢和；抢杠成功不计根）",
    input: {
      config: standard,
      hand: ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "2m", "3m", "4m", "9m"],
      melds: [],
      lack: "p",
      win: { tile: "9m", by: "robKong" },
    },
    expect: { hu: true, fanTypes: ["pinghu", "qiangganghu"], fan: 1, multiplier: 2 },
  },
  {
    id: "bb-015",
    desc: "海底捞月（最后一次正常摸牌自摸）",
    input: {
      config: standard,
      hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "2p", "3p", "4p", "9p"],
      melds: [],
      lack: "s",
      win: { tile: "9p", by: "zimo" },
      context: { isLastTile: true },
    },
    expect: { hu: true, fanTypes: ["pinghu", "zimo", "haidilaoyue"], fan: 2, multiplier: 4 },
  },
  {
    id: "bb-016",
    desc: "海底炮（该次摸牌后弃牌点炮）",
    input: {
      config: standard,
      hand: ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "2m", "3m", "4m", "9m"],
      melds: [],
      lack: "p",
      win: { tile: "9m", by: "discard" },
      context: { isLastTile: true },
    },
    expect: { hu: true, fanTypes: ["pinghu", "haidipao"], fan: 1, multiplier: 2 },
  },
  {
    id: "bb-017",
    desc: "杠上炮+海底炮叠加：操作类附加番互不排斥（decisions.md BB2②），同一张弃牌两者都成立时都计入",
    input: {
      config: standard,
      hand: ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "2m", "3m", "4m", "9m"],
      melds: [],
      lack: "p",
      win: { tile: "9m", by: "discard" },
      context: { afterKong: true, isLastTile: true },
    },
    expect: { hu: true, fanTypes: ["pinghu", "gangshangpao", "haidipao"], fan: 2, multiplier: 4 },
  },
  {
    id: "bb-018",
    desc: "负例：完全凑不出合法分解（4 面子+1 对 / 七对均不成立）",
    input: {
      config: standard,
      hand: ["1m", "3m", "5m", "7m", "9m", "1p", "3p", "5p", "7p", "9p", "2m", "2p", "4m"],
      melds: [],
      lack: "s",
      win: { tile: "9p", by: "discard" },
    },
    expect: { hu: false, reason: "NOT_A_WINNING_SHAPE" },
  },
  {
    id: "bb-019",
    desc: "负例：对子形状但带副露，应判负而非当作 4 面子+1 对解出",
    input: {
      config: standard,
      melds: [{ type: "peng", tiles: ["9p", "9p", "9p"] }],
      hand: ["1m", "1m", "3m", "3m", "5m", "5m", "7m", "7m", "2p", "2p"],
      lack: "s",
      win: { tile: "4p", by: "discard" },
    },
    expect: { hu: false, reason: "SEVEN_PAIRS_WITH_MELDS" },
  },
  {
    id: "bb-020",
    desc: "封顶边界：capFan:null（不封顶）时 multiplier = 2^fan 精确值，不带 cappedAt",
    input: {
      config: { capFan: null, selfDrawBonus: "addFan" },
      melds: [
        { type: "peng", tiles: ["1m", "1m", "1m"] },
        { type: "peng", tiles: ["3m", "3m", "3m"] },
        { type: "peng", tiles: ["5m", "5m", "5m"] },
      ],
      hand: ["7m", "7m", "9m", "9m"],
      lack: "p",
      win: { tile: "7m", by: "zimo" },
    },
    expect: { hu: true, fanTypes: ["duiduihu", "qingyise", "zimo"], fan: 4, multiplier: 16 },
  },
];

// fanTypes is set semantics (rules-bloodbattle.md "约定": order-independent,
// duplicate entries count multiple 根) — sort before comparing so declaration
// order in a fixture doesn't matter.
const normalize = (result: BloodbattleScoringResult): BloodbattleScoringResult =>
  "fanTypes" in result ? { ...result, fanTypes: [...result.fanTypes].sort() } : result;

test.each(bloodbattleScoringFixtures)("$id $desc", (fixture) => {
  expect(normalize(scoreBloodbattleHand(fixture.input))).toEqual(normalize(fixture.expect));
});
