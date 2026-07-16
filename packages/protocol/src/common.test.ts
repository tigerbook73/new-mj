import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  ErrCodeSchema,
  GameConfigSchema,
  SeatIdSchema,
  SessionFormatSchema,
} from "./common.ts";

describe("common protocol schemas", () => {
  it("accepts the four valid seats and rejects other values", () => {
    expect([0, 1, 2, 3].map((seat) => SeatIdSchema.parse(seat))).toEqual([0, 1, 2, 3]);
    expect(() => SeatIdSchema.parse(4)).toThrow();
  });

  it("accepts only supported session formats", () => {
    expect(SessionFormatSchema.parse("4-round")).toBe("4-round");
    expect(SessionFormatSchema.parse("best-of-3")).toBe("best-of-3");
    expect(() => SessionFormatSchema.parse("best-of-5")).toThrow();
  });

  it("requires rulesetId but preserves ruleset-specific config", () => {
    const config = { rulesetId: "junk", maxFan: 8 };
    expect(GameConfigSchema.parse(config)).toEqual(config);
    expect(() => GameConfigSchema.parse({ maxFan: 8 })).toThrow();
  });

  it("keeps ErrCodeSchema aligned with the protocol error list", () => {
    expect(ErrCodeSchema.options).toEqual(ERROR_CODES);
  });
});
