import { STANDARD_TILE_SET } from "../tiles.ts";
import type { RuleSet } from "../ruleset.ts";

const notImplemented = () => ({
  error: { code: "RULESET_NOT_IMPLEMENTED", message: "junk RuleSet is pending interface review" },
});

/**
 * Empty implementation used only to review the RuleSet boundary.
 * It must not gain gameplay behavior until the Step 3 interface is accepted.
 */
export const junkRuleSet: RuleSet = {
  id: "junk",
  tileSet: STANDARD_TILE_SET,
  phases: [
    { id: "dealing", next: ["playing"] },
    { id: "playing", next: ["awaiting-claims", "finished"] },
    { id: "awaiting-claims", next: ["playing", "finished"] },
    { id: "finished", next: [] },
  ],
  getLegalActions: () => [],
  getClaimOptions: () => [],
  applyAction: notImplemented,
  resolveClaims: () => undefined,
  evaluateWin: () => ({ isWin: false }),
  settle: () => ({ scoreDeltas: [0, 0, 0, 0] }),
};
