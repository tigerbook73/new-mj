import type { JunkAction, JunkPlayerView } from "@new-mj/core";
import { evaluateStructuralClaim } from "./structural-claim.ts";
import { evaluateStructuralTurn } from "./structural-turn.ts";

/** Stable identity of the current production policy; bump the version for intentional behavior changes. */
export const JUNK_STRUCTURAL_BASELINE = Object.freeze({
  id: "structural-baseline",
  version: 2,
  scope: "ordinary-standard+seven-pairs",
} as const);

const isClaimContext = (legalActions: readonly JunkAction[]): boolean =>
  legalActions.some((action) => ["chi", "peng", "minGang", "hu", "pass"].includes(action.type));

/**
 * Frozen v2 policy used by production and baseline tests: same ordinary-standard
 * discard/claim/gang pipeline as v1, now folding the seven-pairs route into every
 * comparison that doesn't itself create a meld (discard, pass) — see
 * `structural-discard.ts`'s `canPursueSevenPairs`/`evaluateVisibleStructuralShapeBestRoute`
 * doc for the eligibility rule. Fan value, defense and other special routes
 * (flush, all-pungs) remain out of scope.
 */
export const recommendStructuralBaselineV2Action = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
): JunkAction | undefined =>
  recommendStructuralBaselineV2ActionWithDiagnostics(view, legalActions).action;

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
 * Same policy as `recommendStructuralBaselineV2Action`, plus a lightweight diagnostics summary
 * for the claim/turn branch actually taken. Reuses `evaluateStructuralClaim`/`evaluateStructuralTurn`'s
 * already-computed candidates — no extra search. hu/zimo/draw short-circuits and the
 * no-candidates-available fallback both carry `diagnostics: null` (there was nothing to search).
 */
export const recommendStructuralBaselineV2ActionWithDiagnostics = (
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
