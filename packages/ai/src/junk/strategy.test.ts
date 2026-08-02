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

  it("keeps the fixed rob-kong risk when comparing gang actions", () => {
    const player = view(["1m", "1m", "1m", "1m"]);
    const actions: JunkAction[] = [
      { type: "anGang", kind: "1m" },
      { type: "buGang", tile: player.hand[0]! },
    ];
    expect(recommendJunkAction(player, actions)).toBe(actions[0]);
  });

  it("throws only when there is no legal action", () => {
    expect(() => chooseJunkAction(view([]), [])).toThrow("no legal actions");
  });
});
