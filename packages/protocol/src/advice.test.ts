import { describe, expect, it } from "vitest";
import { GameAdviceRequestSchema, GameAdviceResponseSchema } from "./advice.ts";

describe("game advice protocol", () => {
  it("accepts only an empty request", () => {
    expect(GameAdviceRequestSchema.parse({})).toEqual({});
    expect(() => GameAdviceRequestSchema.parse({ seat: 1 })).toThrow();
  });

  it("accepts empty and indexed advice responses", () => {
    expect(GameAdviceResponseSchema.parse({ seq: 1, actions: [] })).toEqual({
      seq: 1,
      actions: [],
    });
    expect(
      GameAdviceResponseSchema.parse({
        seq: 2,
        deadline: 1000,
        actions: [{ type: "discard", tile: 1 }],
        recommendedActionIndex: 0,
      }),
    ).toMatchObject({ recommendedActionIndex: 0 });
  });

  it("rejects a recommendation outside the action array", () => {
    expect(() =>
      GameAdviceResponseSchema.parse({ seq: 1, actions: [], recommendedActionIndex: 0 }),
    ).toThrow();
  });
});
