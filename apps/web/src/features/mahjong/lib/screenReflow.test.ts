import { describe, expect, it } from "vitest";
import { screenDeltaToLocal } from "./screenReflow";

describe("screenDeltaToLocal", () => {
  it("maps the same viewport delta through every seat rotation", () => {
    expect(screenDeltaToLocal("bottom", 10, 20)).toEqual([10, 20]);
    expect(screenDeltaToLocal("top", 10, 20)).toEqual([-10, -20]);
    expect(screenDeltaToLocal("left", 10, 20)).toEqual([20, -10]);
    expect(screenDeltaToLocal("right", 10, 20)).toEqual([-20, 10]);
  });
});
