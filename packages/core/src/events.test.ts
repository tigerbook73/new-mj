import assert from "node:assert/strict";
import { test } from "vitest";
import { createEvent, nextEventSeq } from "@/index";

test("event sequence is explicit and monotonic", () => {
  assert.equal(nextEventSeq(0), 1);
  assert.deepEqual(createEvent(1, { type: "public" }, { type: "Started" }), {
    seq: 1,
    visibility: { type: "public" },
    payload: { type: "Started" },
  });
  assert.throws(() => nextEventSeq(-1), { message: "INVALID_EVENT_SEQUENCE" });
});
