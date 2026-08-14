import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  writeTextEvaluationArtifacts,
  type TextArtifactRuntime,
} from "../../../evaluation/text-artifacts.ts";
import {
  validatePairedStructuralCandidate,
  type PairedStructuralValidation,
} from "../paired-validation.ts";

export const validateUsage =
  "Usage: pnpm --filter @new-mj/ai evaluate scenario validate [options]\n\n" +
  "Options:\n" +
  "  --development-seed <int>     Development split seed (default: 20260814)\n" +
  "  --held-out-seed <int>        Held-out split seed (default: 20260815)\n" +
  "  --count <int>                Samples per split (default: 100)\n" +
  "  --candidate-isolation <n>    Candidate isolationPotential (default: 0)\n" +
  "  --run-id <id>                Stable artifact name\n" +
  "  --output-dir <dir>           Output directory (default: packages/ai/.evaluation-runs)\n";

type Runtime = TextArtifactRuntime &
  Readonly<{
    now?: () => Date;
    gitSha?: () => string;
  }>;

const currentGitSha = (): string =>
  execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();

const formatSplit = (label: string, split: PairedStructuralValidation["development"]): string =>
  `${label}: scenarios=${split.scenarioCount}, decisions-differ=${split.decisionDifferenceCount}, ` +
  `dominated baseline=${split.baselineDominatedSelectionCount}, ` +
  `candidate=${split.candidateDominatedSelectionCount}`;

export const formatPairedStructuralValidation = (result: PairedStructuralValidation): string =>
  [
    "=== Junk paired structural validation ===",
    `protocol: ${result.protocolVersion}`,
    `generator: ${result.generatorVersion}`,
    `candidate isolationPotential: ${result.candidate.isolationPotential}`,
    `split disjoint: ${result.splitDisjoint}`,
    formatSplit("development", result.development),
    formatSplit("held-out", result.heldOut),
    `accepted by structural gate: ${result.accepted}`,
    "note: this gate is not a win-rate or EV claim and never writes production weights.",
  ].join("\n");

export const runPairedStructuralValidationCli = (
  argv: readonly string[],
  runtime: Runtime = {},
): { exitCode: number; output: string } => {
  try {
    if (argv.includes("--help")) return { exitCode: 0, output: validateUsage };
    let developmentSeed = 20260814;
    let heldOutSeed = 20260815;
    let count = 100;
    let candidateIsolationPotential = 0;
    let outputDir = "packages/ai/.evaluation-runs";
    let runId: string | undefined;
    for (let index = 0; index < argv.length; index += 2) {
      const flag = argv[index];
      const value = argv[index + 1];
      if (!value) throw new Error(`MISSING_VALUE: ${flag}`);
      if (flag === "--development-seed") developmentSeed = Number(value);
      else if (flag === "--held-out-seed") heldOutSeed = Number(value);
      else if (flag === "--count") count = Number(value);
      else if (flag === "--candidate-isolation") candidateIsolationPotential = Number(value);
      else if (flag === "--output-dir") outputDir = value;
      else if (flag === "--run-id") runId = value;
      else throw new Error(`UNKNOWN_ARGUMENT: ${flag}`);
    }
    if (![developmentSeed, heldOutSeed, count].every(Number.isSafeInteger) || count < 1) {
      throw new Error("INVALID_INTEGER_ARGUMENT");
    }
    if (!Number.isFinite(candidateIsolationPotential)) throw new Error("INVALID_CANDIDATE_WEIGHT");
    const startedAt = (runtime.now ?? (() => new Date()))();
    const effectiveRunId =
      runId ?? `paired-structural-${startedAt.toISOString().replaceAll(":", "-")}`;
    const result = validatePairedStructuralCandidate({
      developmentSeed,
      heldOutSeed,
      count,
      candidateIsolationPotential,
    });
    const report = formatPairedStructuralValidation(result);
    const paths = writeTextEvaluationArtifacts(
      path.resolve(outputDir),
      `junk-${effectiveRunId}`,
      {
        run: {
          schemaVersion: 1,
          runId: effectiveRunId,
          command: `pnpm --filter @new-mj/ai evaluate scenario validate ${argv.join(" ")}`.trim(),
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
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${validateUsage}`,
    };
  }
};
