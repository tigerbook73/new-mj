import { SEAT_IDS, type SeatId } from "@new-mj/core";
import { buildPolicy } from "../policy/policy-loader.ts";
import { playJunkMatch, type JunkMatchResult, type SeatPolicy } from "./arena.ts";
import type { MatchWorkerPool } from "./worker-pool.ts";

export type PolicyMatchSource = Readonly<{
  modulePath: string;
  weightsPath?: string;
  exportName?: string;
}>;

export type PolicyMatchTask = Readonly<{
  seed: number;
  candidateSeats: readonly SeatId[];
  baseline: PolicyMatchSource;
  candidate: PolicyMatchSource;
}>;

export type PolicyMatchTaskResult = Readonly<{
  ok: boolean;
  candidateTotal: number;
  baselineTotal: number;
}>;

export type PolicyMatchupResult = Readonly<{
  candidateScore: number;
  baselineScore: number;
  candidateWins: number;
  totalMatches: number;
}>;

const CANDIDATE_SEAT_SPLITS: readonly SeatId[][] = [
  [0, 2],
  [1, 3],
];

const splitMatchScore = (
  result: JunkMatchResult,
  candidateSeats: readonly SeatId[],
): Pick<PolicyMatchTaskResult, "candidateTotal" | "baselineTotal"> => {
  const candidateTotal = candidateSeats.reduce<number>((sum, seat) => sum + result.scores[seat], 0);
  return {
    candidateTotal,
    baselineTotal: result.scores.reduce((sum, score) => sum + score, 0) - candidateTotal,
  };
};

export const runPolicyMatchTask = async (task: PolicyMatchTask): Promise<PolicyMatchTaskResult> => {
  const [baselinePolicy, candidatePolicy] = await Promise.all([
    buildPolicy(task.baseline.modulePath, task.baseline.weightsPath, task.baseline.exportName),
    buildPolicy(task.candidate.modulePath, task.candidate.weightsPath, task.candidate.exportName),
  ]);
  const policies = SEAT_IDS.map((seat) =>
    task.candidateSeats.includes(seat) ? candidatePolicy : baselinePolicy,
  ) as [SeatPolicy, SeatPolicy, SeatPolicy, SeatPolicy];
  const result = playJunkMatch(task.seed, policies);
  if ("error" in result) return { ok: false, candidateTotal: 0, baselineTotal: 0 };
  return { ok: true, ...splitMatchScore(result, task.candidateSeats) };
};

export const evaluateCandidatePolicies = async (
  seeds: readonly number[],
  baseline: PolicyMatchSource,
  candidate: PolicyMatchSource,
  pool?: MatchWorkerPool<PolicyMatchTask, PolicyMatchTaskResult>,
): Promise<PolicyMatchupResult> => {
  const tasks = seeds.flatMap((seed) =>
    CANDIDATE_SEAT_SPLITS.map((candidateSeats) => ({
      seed,
      candidateSeats,
      baseline,
      candidate,
    })),
  );
  const results = pool
    ? await pool.runAll(tasks)
    : await Promise.all(tasks.map(runPolicyMatchTask));

  let candidateScore = 0;
  let baselineScore = 0;
  let candidateWins = 0;
  let totalMatches = 0;
  for (const result of results) {
    if (!result.ok) continue;
    totalMatches += 1;
    candidateScore += result.candidateTotal;
    baselineScore += result.baselineTotal;
    if (result.candidateTotal > result.baselineTotal) candidateWins += 1;
  }
  return { candidateScore, baselineScore, candidateWins, totalMatches };
};
