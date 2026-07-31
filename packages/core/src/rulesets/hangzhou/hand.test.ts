import { expect, test } from "vitest";
import type { TileKind } from "../../lib/ids.ts";
import {
  evaluateSevenPairsWithWild,
  isBaotou,
  isStandardWinningHandWithWild,
  isTingpai,
} from "./hand.ts";

const kinds = (list: string): TileKind[] => list.split(" ").filter(Boolean) as TileKind[];
const CAI = "7z" as TileKind;

test("isStandardWinningHandWithWild: fully real hand forms 4 melds + pair", () => {
  const hand = kinds("1m 2m 3m 4m 5m 6m 7m 8m 9m 1p 1p 1s 1s 1s");
  expect(isStandardWinningHandWithWild(hand, 0)).toBe(true);
});

test("isStandardWinningHandWithWild: caishen fills a run gap", () => {
  const hand = kinds(`1m 2m ${CAI} 4m 5m 6m 7m 8m 9m 1p 1p 1s 1s 1s`);
  expect(isStandardWinningHandWithWild(hand, 0)).toBe(true);
});

test("isStandardWinningHandWithWild: two caishen alone form the pair", () => {
  const hand = kinds(`1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 1s 1s ${CAI} ${CAI}`);
  expect(isStandardWinningHandWithWild(hand, 0)).toBe(true);
});

test("isStandardWinningHandWithWild: negative case reports a shape that cannot complete", () => {
  // Scattered, unconnected kinds with no wild to bridge them.
  const hand = kinds("1m 4m 7m 1p 4p 7p 1s 4s 7s 1z 2z 3z 4z 5z");
  expect(isStandardWinningHandWithWild(hand, 0)).toBe(false);
});

test("isStandardWinningHandWithWild: respects already-declared open melds", () => {
  // 1 open meld already declared elsewhere -> only 3 melds + pair needed concealed (11 tiles).
  const hand = kinds("1m 2m 3m 4m 5m 6m 7m 8m 9m 1p 1p");
  expect(isStandardWinningHandWithWild(hand, 1)).toBe(true);
  expect(isStandardWinningHandWithWild(hand, 0)).toBe(false);
});

test("evaluateSevenPairsWithWild: plain seven pairs, no wild", () => {
  const hand = kinds("1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 1z 1z");
  expect(evaluateSevenPairsWithWild(hand)).toEqual({ valid: true, quadCount: 0 });
});

test("evaluateSevenPairsWithWild: caishen fills a lone tile up to a pair", () => {
  const hand = kinds(`1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 1z ${CAI}`);
  expect(evaluateSevenPairsWithWild(hand)).toEqual({ valid: true, quadCount: 0 });
});

test("evaluateSevenPairsWithWild: a real quad counts as two pair-slots (deluxe)", () => {
  // 1 quad (worth 2 slots) + 5 real pairs = 7 slots, 14 tiles total.
  const hand = kinds("1m 1m 1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m");
  expect(evaluateSevenPairsWithWild(hand)).toEqual({ valid: true, quadCount: 1 });
});

test("evaluateSevenPairsWithWild: two quads (shuangHaohua)", () => {
  const hand = kinds("1m 1m 1m 1m 2m 2m 2m 2m 3m 3m 4m 4m 5m 5m");
  expect(evaluateSevenPairsWithWild(hand)).toEqual({ valid: true, quadCount: 2 });
});

test("evaluateSevenPairsWithWild: caishen cannot pad a triple into a deluxe quad", () => {
  const hand = kinds(`1m 1m 1m ${CAI} 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m`);
  expect(evaluateSevenPairsWithWild(hand).valid).toBe(false);
});

test("evaluateSevenPairsWithWild: too many distinct kinds cannot be seven pairs", () => {
  const hand = kinds("1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 8m");
  expect(evaluateSevenPairsWithWild(hand).valid).toBe(false);
});

test("isTingpai: waiting on exactly one more tile", () => {
  const hand = kinds("1m 2m 3m 4m 5m 6m 7m 8m 9m 1p 1p 1s 1s");
  expect(isTingpai(hand, 0)).toBe(true);
});

test("isTingpai: not waiting on anything", () => {
  const hand = kinds("1m 4m 7m 1p 4p 7p 1s 4s 7s 1z 2z 3z 4z");
  expect(isTingpai(hand, 0)).toBe(false);
});

test("isBaotou: four real triplets + one caishen wins on literally any draw", () => {
  const hand = kinds(`1m 1m 1m 2m 2m 2m 3m 3m 3m 4m 4m 4m ${CAI}`);
  expect(isTingpai(hand, 0)).toBe(true);
  expect(isBaotou(hand, 0)).toBe(true);
});

test("isBaotou: false without holding a caishen even if tingpai", () => {
  const hand = kinds("1m 2m 3m 4m 5m 6m 7m 8m 9m 1p 1p 1s 1s");
  expect(isTingpai(hand, 0)).toBe(true);
  expect(isBaotou(hand, 0)).toBe(false);
});

test("isBaotou: false when holding caishen but only waiting on specific tiles", () => {
  // 3 triplets + a complete pair leave {9s, caishen} needing one more meld:
  // only drawing 7s/8s/9s completes it, not every one of the 34 kinds.
  const hand = kinds(`1m 1m 1m 2m 2m 2m 3m 3m 3m 4m 4m 9s ${CAI}`);
  expect(isTingpai(hand, 0)).toBe(true);
  expect(isBaotou(hand, 0)).toBe(false);
});
