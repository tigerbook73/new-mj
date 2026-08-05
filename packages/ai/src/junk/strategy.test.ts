import {
  isTingpai,
  tileIdOf,
  type JunkAction,
  type JunkPlayerView,
  type TileKind,
} from "@new-mj/core";
import { describe, expect, it } from "vitest";
import { chooseJunkAction, recommendJunkAction, scoreHandShapeAfterDiscard } from "./strategy.ts";

const ids = (kinds: readonly TileKind[]) => {
  const copies = new Map<TileKind, number>();
  return kinds.map((kind) => {
    const copy = copies.get(kind) ?? 0;
    copies.set(kind, copy + 1);
    return tileIdOf(kind, copy);
  });
};

const view = (hand: TileKind[]): JunkPlayerView => ({
  seat: 0,
  hand: ids(hand),
  wallCount: 50,
  currentSeat: 0,
  dealer: 0,
  phase: "playing",
  seats: [0, 1, 2, 3].map(() => ({ handCount: 13, melds: [], discards: [], justDrawn: false })),
});
describe("junk strategy", () => {
  it("always takes a legal win and preserves its original reference", () => {
    const actions: JunkAction[] = [{ type: "pass" }, { type: "hu" }];
    expect(recommendJunkAction(view(["1m"]), actions)).toBe(actions[1]);
  });

  it("keeps a one-away hand instead of breaking it", () => {
    const player = view([
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "7m",
      "8m",
      "9m",
      "1p",
      "1p",
      "1s",
      "1s",
      "1s",
    ]);
    const actions: JunkAction[] = player.hand.map((tile) => ({ type: "discard", tile }));
    const result = chooseJunkAction(player, actions);
    expect(result.type).toBe("discard");
    if (result.type !== "discard") throw new Error("expected discard");
    expect(actions).toContain(result);
    expect(
      isTingpai(
        player.hand.filter((tile) => tile !== result.tile),
        { sevenPairs: true },
      ),
    ).toBe(true);
  });

  it("passes on a chi that would break an already-tenpai hand", () => {
    // Bug report: the AI never recommended pass, and would chi even when the
    // player already held a complete concealed triplet — because pass was
    // scored as a hardcoded -1000 regardless of how good the current hand
    // already was. Here the hand is tenpai (a complete 1m-9m run, a concealed
    // 9s triplet, waiting to pair 1p) and the only chi available would tear
    // the run apart for no gain — pass must win.
    const player: JunkPlayerView = {
      ...view(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "9s", "9s", "9s", "1p"]),
      lastDiscard: { seat: 3, tile: tileIdOf("4m", 1) },
    };
    const actions: JunkAction[] = [
      { type: "chi", tiles: [tileIdOf("3m", 0), tileIdOf("5m", 0)] },
      { type: "pass" },
    ];
    expect(recommendJunkAction(player, actions)).toBe(actions[1]);
  });

  it("uses visible discards as a safety tie-break", () => {
    const player = view(["1m", "1m", "2m", "2m"]);
    const first = player.hand[0]!;
    const second = player.hand[2]!;
    expect(
      scoreHandShapeAfterDiscard({ hand: player.hand, melds: [] }, first, [first]),
    ).toBeGreaterThan(scoreHandShapeAfterDiscard({ hand: player.hand, melds: [] }, second));
  });

  it("always evaluates seven-pairs potential under Junk's fixed rules", () => {
    // 6 对 + 7z + 9m：打掉孤张 9m 后按七对听 7z（向听 0）；拆一对 1z 则退回
    // 向听 1。两者分差主要来自向听 ×100——若七对不再参与向听评估，两个弃牌
    // 的标准型向听相同，分差会塌缩到个位数，本断言即失败。
    const player = view([
      "1z",
      "1z",
      "2z",
      "2z",
      "3z",
      "3z",
      "4z",
      "4z",
      "5z",
      "5z",
      "6z",
      "6z",
      "7z",
      "9m",
    ]);
    const keepPairs = scoreHandShapeAfterDiscard(
      { hand: player.hand, melds: [] },
      player.hand[13]!,
    );
    const breakPair = scoreHandShapeAfterDiscard({ hand: player.hand, melds: [] }, player.hand[0]!);
    expect(keepPairs - breakPair).toBeGreaterThan(50);
  });

  it("prefers anGang over buGang when both leave an equally good hand", () => {
    // Realistic mid-hand state: seat 0 already has a peng of 9s and holds the
    // 4th copy (buGang-eligible) plus a concealed 1m kong (anGang-eligible) and
    // two clean runs — both gangs leave a comparable shape, so only the fixed
    // gangkai bonus (anGang 5 > buGang 3) should decide the recommendation.
    const pengTiles = [0, 1, 2].map((copy) => tileIdOf("9s", copy));
    const hand = [
      ...[0, 1, 2, 3].map((copy) => tileIdOf("1m", copy)),
      tileIdOf("9s", 3),
      ...ids(["1p", "2p", "3p", "4p", "5p", "6p"]),
    ];
    const player: JunkPlayerView = {
      seat: 0,
      hand,
      wallCount: 50,
      currentSeat: 0,
      dealer: 0,
      phase: "playing",
      seats: [0, 1, 2, 3].map((seat) => ({
        handCount: seat === 0 ? hand.length : 13,
        melds: seat === 0 ? [{ type: "peng", tiles: pengTiles, from: 1 }] : [],
        discards: [],
        justDrawn: false,
      })),
    };
    const actions: JunkAction[] = [
      { type: "anGang", kind: "1m" },
      { type: "buGang", tile: tileIdOf("9s", 3) },
    ];
    expect(recommendJunkAction(player, actions)).toBe(actions[0]);
  });

  it("throws only when there is no legal action", () => {
    expect(() => chooseJunkAction(view([]), [])).toThrow("no legal actions");
  });
});
