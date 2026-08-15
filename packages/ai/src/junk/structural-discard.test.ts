import { STANDARD_TILE_SET } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_JUNK_SNAPSHOT,
  CANONICAL_PRODUCTION_SELECTION,
} from "./evaluation/canonical-fixtures.ts";
import { evaluateStructuralDiscard } from "./structural-discard.ts";

describe("bounded structural discard policy", () => {
  it.each([
    [CANONICAL_PRODUCTION_SELECTION.input, "5p"],
    [CANONICAL_JUNK_SNAPSHOT.input, "1z"],
  ])("keeps the canonical structural choice within a four-candidate budget", (input, kind) => {
    const bounded = evaluateStructuralDiscard(input.view, input.legalActions);
    const full = evaluateStructuralDiscard(input.view, input.legalActions, {
      maxFirstCandidates: Number.POSITIVE_INFINITY,
      applyDominanceGuardrail: false,
    });

    expect(bounded.searchedCandidateCount).toBeLessThanOrEqual(4);
    expect(STANDARD_TILE_SET.kindOf(bounded.action!.tile)).toBe(kind);
    expect(bounded.action).toEqual(full.action);
    expect(
      bounded.candidates.find(({ action }) => action.tile === bounded.action!.tile),
    ).toMatchObject({
      dominated: false,
      searched: true,
    });
  });

  it("never searches a same-shanten strictly dominated first discard", () => {
    const input = CANONICAL_PRODUCTION_SELECTION.input;
    const result = evaluateStructuralDiscard(input.view, input.legalActions);
    expect(result.candidates.filter(({ dominated }) => dominated)).not.toHaveLength(0);
    expect(result.candidates.filter(({ dominated, searched }) => dominated && searched)).toEqual(
      [],
    );
  });
});
