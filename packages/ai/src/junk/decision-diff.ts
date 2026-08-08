import type { JunkAction, JunkPlayerView, SeatId } from "@new-mj/core";
import { playJunkMatch, type SeatPolicy } from "./arena.ts";

export type Divergence = Readonly<{
  seed: number;
  round: number;
  step: number;
  /** Which policy actually drove this decision (all 4 seats); the other policy
   * was only asked "what would you do here" — see runDecisionDiff's doc comment. */
  driver: "baseline" | "candidate";
  seat: SeatId;
  view: JunkPlayerView;
  driverAction: JunkAction;
  otherAction: JunkAction;
}>;

export type DecisionDiffReport = Readonly<{
  decisionPoints: number;
  divergences: readonly Divergence[];
}>;

/** JunkAction is a small discriminated union of JSON-safe fields (numbers/arrays
 * of numbers) — structural equality via JSON.stringify is exact and simple here,
 * no need for a field-by-field comparator. */
const actionsEqual = (a: JunkAction, b: JunkAction): boolean => JSON.stringify(a) === JSON.stringify(b);

type SeatPolicies = readonly [SeatPolicy, SeatPolicy, SeatPolicy, SeatPolicy];

const runOneDirection = (
  seeds: readonly number[],
  driver: SeatPolicy,
  other: SeatPolicy,
  driverLabel: "baseline" | "candidate",
): { decisionPoints: number; divergences: Divergence[] } => {
  let decisionPoints = 0;
  const divergences: Divergence[] = [];
  const policies: SeatPolicies = [driver, driver, driver, driver];
  for (const seed of seeds) {
    playJunkMatch(seed, policies, 4, (info) => {
      decisionPoints += 1;
      const otherAction = other(info.view, info.legalActions);
      if (!actionsEqual(info.action, otherAction)) {
        divergences.push({
          seed,
          round: info.round,
          step: info.step,
          driver: driverLabel,
          seat: info.seat,
          view: info.view,
          driverAction: info.action,
          otherAction,
        });
      }
    });
  }
  return { decisionPoints, divergences };
};

/**
 * Compares two policies by *decision*, not by score — self-play win-rate is too
 * noisy to judge formula-level changes (see packages/ai/AGENTS.md's A/B rule;
 * confirmed by three seeds of tune:junk converging on noise). One policy actually
 * drives each match (all 4 seats), the other is only asked "what would you do
 * here" at every decision point without ever being applied — this sidesteps the
 * "two policies disagree, which state is now real" branching problem, at the
 * cost of only sampling states the driver would reach. Running once with each
 * side driving covers both distributions, mirroring evaluateCandidate's
 * duplicate-deal "run both directions to cancel bias" spirit (see tune.ts).
 */
export const runDecisionDiff = (
  seeds: readonly number[],
  baseline: SeatPolicy,
  candidate: SeatPolicy,
): DecisionDiffReport => {
  const baselineDrives = runOneDirection(seeds, baseline, candidate, "baseline");
  const candidateDrives = runOneDirection(seeds, candidate, baseline, "candidate");
  return {
    decisionPoints: baselineDrives.decisionPoints + candidateDrives.decisionPoints,
    divergences: [...baselineDrives.divergences, ...candidateDrives.divergences],
  };
};
