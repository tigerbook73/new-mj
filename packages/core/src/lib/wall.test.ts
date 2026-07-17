import assert from "node:assert/strict";
import { test } from "vitest";
import { createPrng, createWall, drawFromHead, drawFromTail } from "@/index";

test("PRNG is deterministic and serializable", () => {
  const first = createWall(createPrng(42));
  const second = createWall(createPrng(42));
  assert.deepEqual(first, second);
  const restored = createWall({ ...first.prng });
  const continued = createWall(first.prng);
  assert.deepEqual(restored, continued);
});

test("wall draws immutably from head and tail", () => {
  const wall = [1, 2, 3];
  assert.deepEqual(drawFromHead(wall), { tile: 1, wall: [2, 3] });
  assert.deepEqual(drawFromTail(wall), { tile: 3, wall: [1, 2] });
  assert.deepEqual(wall, [1, 2, 3]);
});
