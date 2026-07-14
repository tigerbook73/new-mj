import test from "node:test";

test("workspace dependency direction is valid", async () => {
  await import("./check-deps.mjs");
});
