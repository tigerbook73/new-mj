import { parentPort } from "node:worker_threads";
import type { SeatId } from "@new-mj/core";
import { playJunkMatch, strengthPolicy } from "./arena.ts";

export type ArenaTask = Readonly<{ seed: number; rounds: number }>;

export type ArenaTaskResult =
  | Readonly<{
      ok: true;
      seed: number;
      scores: readonly [number, number, number, number];
      ranking: readonly SeatId[];
    }>
  | Readonly<{ ok: false; seed: number; error: string }>;

export const runArenaTask = ({ seed, rounds }: ArenaTask): ArenaTaskResult => {
  const policies = [
    strengthPolicy(),
    strengthPolicy(),
    strengthPolicy(),
    strengthPolicy(),
  ] as const;
  const result = playJunkMatch(seed, policies, rounds);
  return "error" in result
    ? { ok: false, seed, error: result.error }
    : { ok: true, seed, scores: result.scores, ranking: result.ranking };
};

const workerPort = parentPort;
if (workerPort) {
  workerPort.on("message", (task: ArenaTask) => workerPort.postMessage(runArenaTask(task)));
}
