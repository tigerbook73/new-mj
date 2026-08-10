import { describe, expect, it } from "vitest";
import { STANDARD_TILE_SET } from "@new-mj/core";
import { CANONICAL_JUNK_SNAPSHOT } from "./canonical-fixtures.ts";

describe("Junk snapshot provider", () => {
  it("preserves visible midgame context in a legal hash-stable input", () => {
    const normalized = CANONICAL_JUNK_SNAPSHOT;
    expect(normalized.scenario.source.kind).toBe("snapshot");
    expect(normalized.input.view.seats.flatMap(({ discards }) => discards)).toHaveLength(7);
    expect(normalized.input.view.seats[2]?.melds[0]?.type).toBe("peng");
    expect(STANDARD_TILE_SET.kindOf(normalized.input.view.justDrawn!)).toBe("1z");
    expect(normalized.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    expect(normalized.input.legalActions).toHaveLength(14);
  });
});
