import { STANDARD_TILE_SET, type JunkAction, type JunkPlayerView } from "@new-mj/core";
import { describe, expect, it } from "vitest";
import {
  JUNK_STRUCTURAL_BASELINE,
  recommendJunkAction,
  recommendStructuralBaselineV1Action,
} from "../strategy.ts";
import manifestData from "./fixtures/structural-baseline-v1.json" with { type: "json" };
import {
  CANONICAL_JUNK_SCENARIO_PROVIDER,
  JUNK_CALIBRATION_MANIFEST,
} from "./canonical-fixtures.ts";

type ExpectedAction = Readonly<{ type: string; kind?: string }>;

const actionIdentity = (
  action: ReturnType<typeof recommendJunkAction>,
): ExpectedAction | undefined =>
  action && action.type === "discard"
    ? { type: action.type, kind: STANDARD_TILE_SET.kindOf(action.tile) }
    : action
      ? { type: action.type }
      : undefined;

const flowView = (phase: JunkPlayerView["phase"]): JunkPlayerView => ({
  seat: 0,
  currentSeat: 0,
  dealer: 0,
  hand: [],
  seats: [0, 1, 2, 3].map(() => ({
    melds: [],
    discards: [],
    handCount: 0,
    justDrawn: false,
  })),
  wallCount: 20,
  phase,
});

describe("structural-baseline-v1 manifest", () => {
  it("matches the production baseline identity and canonical input manifest", () => {
    expect(manifestData).toMatchObject(JUNK_STRUCTURAL_BASELINE);
    expect(manifestData.inputManifest).toEqual({
      id: JUNK_CALIBRATION_MANIFEST.id,
      version: JUNK_CALIBRATION_MANIFEST.version,
    });
  });

  it.each(manifestData.behavior)("locks $scenarioId", ({ scenarioId, expectedAction }) => {
    const scenario = JUNK_CALIBRATION_MANIFEST.scenarios.find(({ id }) => id === scenarioId)!;
    const { input } = CANONICAL_JUNK_SCENARIO_PROVIDER.resolve(scenario);
    const baseline = recommendStructuralBaselineV1Action(input.view, input.legalActions);
    const production = recommendJunkAction(input.view, input.legalActions);

    expect(actionIdentity(baseline)).toEqual(expectedAction);
    expect(production).toBe(baseline);
  });

  it.each(manifestData.flowActions)("locks the %s flow action", (type) => {
    const phase = type === "draw" ? "awaiting-draw" : type === "hu" ? "awaiting-claims" : "playing";
    const action = { type } as JunkAction;
    const alternatives: JunkAction[] =
      type === "hu"
        ? [{ type: "pass" }, action]
        : type === "zimo"
          ? [{ type: "discard", tile: 0 }, action]
          : [action];
    const baseline = recommendStructuralBaselineV1Action(flowView(phase), alternatives);

    expect(baseline).toBe(action);
    expect(recommendJunkAction(flowView(phase), alternatives)).toBe(baseline);
  });
});
