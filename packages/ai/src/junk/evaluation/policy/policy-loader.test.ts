import { describe, expect, it } from "vitest";
import { resolveModulePath } from "./policy-loader.ts";

describe("policy source validation", () => {
  it("rejects passing both ref and modulePath before touching Git", () => {
    expect(() => resolveModulePath({ ref: "HEAD", modulePath: "strategy.ts" })).toThrow(
      "POLICY_SOURCE_AMBIGUOUS",
    );
  });
});
