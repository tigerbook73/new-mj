import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  writeTextEvaluationArtifacts,
  type TextArtifactRuntime,
} from "../../../evaluation/text-artifacts.ts";
import {
  auditStructuralTeacher,
  type StructuralTeacherAudit,
} from "../structural-teacher-audit.ts";

export const teacherAuditUsage =
  "Usage: pnpm --filter @new-mj/ai evaluate scenario teacher-audit [options]\n\n" +
  "Options:\n" +
  "  --development-seed <int>     Development split seed (default: 20260814)\n" +
  "  --held-out-seed <int>        Held-out split seed (default: 20260815)\n" +
  "  --count <int>                Samples per split (default: 1000)\n" +
  "  --run-id <id>                Stable artifact name\n" +
  "  --output-dir <dir>           Output directory (default: packages/ai/.evaluation-runs)\n";

type Runtime = TextArtifactRuntime &
  Readonly<{ now?: () => Date; gitSha?: () => string; audit?: typeof auditStructuralTeacher }>;

const currentGitSha = (): string =>
  execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();

const formatSplit = (label: string, split: StructuralTeacherAudit["development"]): string =>
  `${label}: scenarios=${split.scenarioCount}, agreement=${split.agreementCount}/${split.scenarioCount} ` +
  `(${(split.agreementRate * 100).toFixed(2)}%), mismatches=${split.mismatchCount}, ` +
  `searched=${split.averageBoundedSearchedCandidateCount.toFixed(2)}, ` +
  `bounded p50/p95=${split.boundedLatency.p50Ms.toFixed(2)}/${split.boundedLatency.p95Ms.toFixed(2)}ms, ` +
  `full p50/p95=${split.fullLatency.p50Ms.toFixed(2)}/${split.fullLatency.p95Ms.toFixed(2)}ms, ` +
  `p95 ratio=${split.p95Ratio.toFixed(3)}`;

export const formatStructuralTeacherAudit = (result: StructuralTeacherAudit): string =>
  [
    "=== Junk bounded/full structural teacher audit ===",
    `protocol: ${result.protocolVersion}`,
    `generator: ${result.generatorVersion}`,
    `split disjoint: ${result.splitDisjoint}`,
    `thresholds: agreement>=${result.thresholds.minimumAgreementRate}, p95-ratio<=${result.thresholds.maximumP95Ratio}`,
    formatSplit("development", result.development),
    formatSplit("held-out", result.heldOut),
    `accepted: ${result.accepted}`,
    "note: this audit is not a hand-theory, win-rate, wall-truth, or EV claim and never changes production policy.",
  ].join("\n");

export const runStructuralTeacherAuditCli = (
  argv: readonly string[],
  runtime: Runtime = {},
): { exitCode: number; output: string } => {
  try {
    if (argv.includes("--help")) return { exitCode: 0, output: teacherAuditUsage };
    let developmentSeed = 20260814;
    let heldOutSeed = 20260815;
    let count = 1000;
    let outputDir = "packages/ai/.evaluation-runs";
    let runId: string | undefined;
    for (let index = 0; index < argv.length; index += 2) {
      const flag = argv[index];
      const value = argv[index + 1];
      if (!value) throw new Error(`MISSING_VALUE: ${flag}`);
      if (flag === "--development-seed") developmentSeed = Number(value);
      else if (flag === "--held-out-seed") heldOutSeed = Number(value);
      else if (flag === "--count") count = Number(value);
      else if (flag === "--output-dir") outputDir = value;
      else if (flag === "--run-id") runId = value;
      else throw new Error(`UNKNOWN_ARGUMENT: ${flag}`);
    }
    if (![developmentSeed, heldOutSeed, count].every(Number.isSafeInteger) || count < 1) {
      throw new Error("INVALID_INTEGER_ARGUMENT");
    }
    const startedAt = (runtime.now ?? (() => new Date()))();
    const effectiveRunId =
      runId ?? `structural-teacher-${startedAt.toISOString().replaceAll(":", "-")}`;
    const result = (runtime.audit ?? auditStructuralTeacher)({
      developmentSeed,
      heldOutSeed,
      count,
    });
    const report = formatStructuralTeacherAudit(result);
    const paths = writeTextEvaluationArtifacts(
      path.resolve(outputDir),
      `junk-${effectiveRunId}`,
      {
        run: {
          schemaVersion: 1,
          runId: effectiveRunId,
          command:
            `pnpm --filter @new-mj/ai evaluate scenario teacher-audit ${argv.join(" ")}`.trim(),
          gitSha: (runtime.gitSha ?? currentGitSha)(),
          startedAt: startedAt.toISOString(),
        },
        data: result,
      },
      report,
      runtime,
    );
    return {
      exitCode: 0,
      output: `${report}\njson: ${paths.jsonPath}\ntext: ${paths.textPath}\n`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${teacherAuditUsage}`,
    };
  }
};
