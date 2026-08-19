import type { JunkAction, JunkPlayerView } from "@new-mj/core";
import { evaluateStructuralClaim } from "./structural-claim.ts";
import { evaluateStructuralTurn } from "./structural-turn.ts";

/** Stable identity of the current production policy; bump the version for intentional behavior changes. */
export const JUNK_STRUCTURAL_BASELINE = Object.freeze({
  id: "structural-baseline",
  version: 3,
  scope: "ordinary-standard+seven-pairs+menqing-claim-threshold",
} as const);

const isClaimContext = (legalActions: readonly JunkAction[]): boolean =>
  legalActions.some((action) => ["chi", "peng", "minGang", "hu", "pass"].includes(action.type));

/**
 * Frozen v3 policy used by production and baseline tests: same ordinary-standard
 * + seven-pairs pipeline as v2, now additionally requiring a chi/peng claim to
 * beat pass's shanten by a margin (not just any strict improvement) before it's
 * allowed to break still-alive menqing — see `structural-claim.ts`'s
 * `REQUIRED_MENQING_BREAKING_SHANTEN_MARGIN` doc. minGang is exempt (different
 * value proposition — its rank carries a real immediate-completion probability
 * pass never has). Fan value beyond this one menqing slice, defense and other
 * special routes (flush, all-pungs) remain out of scope.
 */
export const recommendStructuralBaselineV3Action = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): JunkAction | undefined =>
  recommendStructuralBaselineV3ActionWithDiagnostics(view, legalActions).action;

/**
 * Diagnostic-only summary of a claim/turn decision, meant for production observability
 * (JunkBotAgent), not for choosing the action. `chosenConditionalExpectedBestShanten` is
 * `StructuralClaimCandidate`/`StructuralTurnCandidate`'s shared continuation field — it's only
 * meaningfully populated for candidate types that ran a continuation search (minGang, discard,
 * anGang/buGang); chi/peng/pass/zimo candidates carry `null` there by construction.
 */
export type StructuralDecisionDiagnostics = Readonly<{
  decisionKind: "claim" | "turn";
  candidateCount: number;
  /** Only meaningful for "turn" (the discard shortlist size); `null` for "claim". */
  searchedCandidateCount: number | null;
  chosenConditionalExpectedBestShanten: number | null;
}>;

/**
 * Same policy as `recommendStructuralBaselineV3Action`, plus a lightweight diagnostics summary
 * for the claim/turn branch actually taken. Reuses `evaluateStructuralClaim`/`evaluateStructuralTurn`'s
 * already-computed candidates — no extra search. hu/zimo/draw short-circuits and the
 * no-candidates-available fallback both carry `diagnostics: null` (there was nothing to search).
 */
export const recommendStructuralBaselineV3ActionWithDiagnostics = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): { action: JunkAction | undefined; diagnostics: StructuralDecisionDiagnostics | null } => {
  if (legalActions.length === 0) return { action: undefined, diagnostics: null };
  const winning = legalActions.find((action) => action.type === "hu" || action.type === "zimo");
  if (winning) return { action: winning, diagnostics: null };
  const draw = legalActions.find((action) => action.type === "draw");
  if (draw) return { action: draw, diagnostics: null };

  if (isClaimContext(legalActions)) {
    const result = evaluateStructuralClaim(view, legalActions);
    const recommended = result.action;
    const action =
      recommended && legalActions.includes(recommended) ? recommended : legalActions[0];
    const chosen = result.candidates.find((candidate) => candidate.action === recommended);
    return {
      action,
      diagnostics: recommended
        ? {
            decisionKind: "claim",
            candidateCount: result.candidates.length,
            searchedCandidateCount: null,
            chosenConditionalExpectedBestShanten: chosen?.conditionalExpectedBestShanten ?? null,
          }
        : null,
    };
  }

  const result = evaluateStructuralTurn(view, legalActions);
  const recommended = result.action;
  const action = recommended && legalActions.includes(recommended) ? recommended : legalActions[0];
  const chosen = result.candidates.find((candidate) => candidate.action === recommended);
  return {
    action,
    diagnostics: recommended
      ? {
          decisionKind: "turn",
          candidateCount: result.candidates.length,
          searchedCandidateCount: result.searchedDiscardCandidateCount,
          chosenConditionalExpectedBestShanten: chosen?.conditionalExpectedBestShanten ?? null,
        }
      : null,
  };
};
