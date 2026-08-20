import type { JunkAction, JunkPlayerView } from "@new-mj/core";
import {
  JUNK_STRUCTURAL_BASELINE,
  recommendStructuralBaselineV4ActionWithDiagnostics,
  type StructuralDecisionDiagnostics,
} from "./structural-baseline.ts";

export type JunkBotAgentSnapshot = Readonly<{
  strategyId: string;
  strategyVersion: number;
  decisionKind: StructuralDecisionDiagnostics["decisionKind"] | null;
  candidateCount: number | null;
  searchedCandidateCount: number | null;
  chosenConditionalExpectedBestShanten: number | null;
  lastAction: JunkAction;
  decisionDurationMs: number;
}>;

/**
 * Explicit, caller-owned stateful wrapper around the stateless structural baseline functions
 * (packages/ai/AGENTS.md "决策函数本身保持纯函数..."). Holds only its own instance fields — no
 * module-level registry, no hidden cache. Callers (currently only apps/server's bot loop) create
 * one instance per seat and own its lifecycle entirely; the underlying decision functions remain
 * independently callable and deterministic with or without an agent.
 */
export class JunkBotAgent {
  #snapshot: JunkBotAgentSnapshot | null = null;

  decide(view: JunkPlayerView, legalActions: readonly JunkAction[]): JunkAction {
    const startedAt = performance.now();
    const { action, diagnostics } = recommendStructuralBaselineV4ActionWithDiagnostics(
      view,
      legalActions,
    );
    if (!action) throw new Error("JunkBotAgent.decide called with no legal actions");
    this.#snapshot = {
      strategyId: JUNK_STRUCTURAL_BASELINE.id,
      strategyVersion: JUNK_STRUCTURAL_BASELINE.version,
      decisionKind: diagnostics?.decisionKind ?? null,
      candidateCount: diagnostics?.candidateCount ?? null,
      searchedCandidateCount: diagnostics?.searchedCandidateCount ?? null,
      chosenConditionalExpectedBestShanten:
        diagnostics?.chosenConditionalExpectedBestShanten ?? null,
      lastAction: action,
      decisionDurationMs: performance.now() - startedAt,
    };
    return action;
  }

  /** Most recent decision's diagnostic summary; `null` before the first `decide()` call. */
  get snapshot(): JunkBotAgentSnapshot | null {
    return this.#snapshot;
  }
}
