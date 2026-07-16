import { describe, expect, it, vi } from "vitest";
import { chooseAction } from "./strategy.ts";

describe("chooseAction", () => {
  it("throws on an empty action list", () => {
    expect(() => chooseAction([])).toThrow();
  });

  it("always takes a hu when one is legal, even among other options", () => {
    const actions = [{ type: "pass" }, { type: "hu" }, { type: "discard", tile: 3 }];
    expect(chooseAction(actions)).toEqual({ type: "hu" });
  });

  it("always takes a zimo when one is legal", () => {
    const actions = [{ type: "pass" }, { type: "zimo" }];
    expect(chooseAction(actions)).toEqual({ type: "zimo" });
  });

  it("picks uniformly at random when no winning action is present", () => {
    const actions = [
      { type: "discard", tile: 1 },
      { type: "discard", tile: 2 },
    ] as const;
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9);
    try {
      expect(chooseAction(actions)).toEqual({ type: "discard", tile: 2 });
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("returns the sole action when only one is legal", () => {
    const actions = [{ type: "pass" }];
    expect(chooseAction(actions)).toEqual({ type: "pass" });
  });
});
