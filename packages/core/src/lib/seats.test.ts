import assert from "node:assert/strict";
import { test } from "vitest";
import { SEAT_COUNT, SEAT_IDS, nextSeat, seatDistance } from "./seats.ts";

test("four-seat helpers preserve the shared clockwise order", () => {
  assert.deepEqual(SEAT_IDS, [0, 1, 2, 3]);
  assert.equal(SEAT_COUNT, 4);
  assert.equal(nextSeat(3), 0);
  assert.equal(seatDistance(3, 1), 2);
});
