import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_JUNK_SCENARIO_PROVIDER,
  JUNK_CALIBRATION_MANIFEST,
} from "../canonical-fixtures.ts";
import {
  formatCalibrationSummary,
  serializeCalibrationReport,
} from "../../../evaluation/report.ts";
import { evaluateProductionFixture } from "../production-evaluator.ts";
import { evaluateOnePlyAll, evaluateTwoPlyAll } from "../diagnostic-evaluators.ts";
import { evaluateStructuralMetrics } from "../structural-metrics.ts";
import { evaluateStructuralTwoPlyAll } from "../structural-two-ply.ts";
import { evaluateIsolationBoundary } from "../isolation-boundary.ts";
import { evaluateStructuralBounded } from "../structural-bounded.ts";
import { runSingleCalibrationScenarioEvaluators } from "../../../evaluation/runner.ts";
import {
  compareCalibrationBaseline,
  type CalibrationBaseline,
} from "../../../evaluation/comparator.ts";

const packageRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const defaultOutputDir = path.join(packageRoot, ".evaluation-runs");
const usage =
  "Usage: pnpm --filter @new-mj/ai evaluate scenario <command> [options]\n\n" +
  "Commands:\n" +
  "  list                                        List available evaluation scenarios\n" +
  "  run <scenario-id>                           Run one scenario\n" +
  "  batch <manifest.json> <scenarios.jsonl>      Run a snapshot batch\n" +
  "  help                                        Show this help\n\n" +
  "Options:\n" +
  "  --output-dir <dir>                          Write JSON/Markdown reports here\n" +
  "                                              (default: packages/ai/.evaluation-runs)\n" +
  "  --run-id <id>                               Stable report filename prefix\n" +
  "  --baseline <file>                           Compare without modifying baseline\n" +
  "  --help                                      Show this help\n\n" +
  "Examples:\n" +
  "  pnpm --filter @new-mj/ai evaluate scenario list\n" +
  "  pnpm --filter @new-mj/ai evaluate scenario run discard-001\n";

type Arguments = Readonly<{
  list: boolean;
  scenarioId?: string;
  outputDir: string;
  runId?: string;
  baselinePath?: string;
}>;

type Runtime = Readonly<{
  now?: () => Date;
  gitSha?: string;
  exists?: (filePath: string) => boolean;
  write?: (filePath: string, content: string) => void;
  read?: (filePath: string) => string;
  makeDirectory?: (directory: string) => void;
}>;

const parseArguments = (argv: readonly string[]): Arguments => {
  const command = argv[0];
  if (command === "help" || command === "--help") throw new Error(usage);
  if (command !== "list" && command !== "run") {
    throw new Error(`UNKNOWN_COMMAND: ${command ?? "(missing)"}\n${usage}`);
  }
  const list = command === "list";
  const scenarioId: string | undefined = command === "run" ? argv[1] : undefined;
  let outputDir = defaultOutputDir;
  let runId: string | undefined;
  let baselinePath: string | undefined;
  const options = command === "run" ? argv.slice(2) : argv.slice(1);
  for (let index = 0; index < options.length; index += 1) {
    const flag = options[index];
    if (flag === "--output-dir") outputDir = options[++index] ?? "";
    else if (flag === "--run-id") runId = options[++index];
    else if (flag === "--baseline") baselinePath = options[++index];
    else if (flag === "--help") throw new Error(usage);
    else throw new Error(`UNKNOWN_ARGUMENT: ${flag}`);
  }
  if (!list && !scenarioId) throw new Error("MISSING_SCENARIO\n" + usage);
  if (list && scenarioId) throw new Error("LIST_DOES_NOT_ACCEPT_SCENARIO");
  if (!outputDir) throw new Error("MISSING_OUTPUT_DIR");
  if (runId !== undefined && !/^[a-zA-Z0-9._-]+$/.test(runId)) {
    throw new Error("INVALID_RUN_ID");
  }
  return {
    list,
    ...(scenarioId ? { scenarioId } : {}),
    outputDir,
    ...(runId ? { runId } : {}),
    ...(baselinePath ? { baselinePath } : {}),
  };
};

const currentGitSha = (): string => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

const commandFor = (argv: readonly string[]): string =>
  `pnpm --filter @new-mj/ai evaluate ${argv.join(" ")}`;

const listScenarios = (): string =>
  [
    `manifest: ${JUNK_CALIBRATION_MANIFEST.id}@${JUNK_CALIBRATION_MANIFEST.version}`,
    ...(JUNK_CALIBRATION_MANIFEST.description
      ? [`description: ${JUNK_CALIBRATION_MANIFEST.description}`]
      : []),
    ...JUNK_CALIBRATION_MANIFEST.scenarios.map((scenario) => {
      const seed = scenario.source.kind === "generated" ? `, seed=${scenario.source.seed}` : "";
      return `- ${scenario.id} (${scenario.source.kind}${seed})`;
    }),
  ].join("\n") + "\n";

export const runCalibrationCli = (
  argv: readonly string[],
  runtime: Runtime = {},
): { exitCode: number; output: string } => {
  try {
    if (argv.includes("--help") || argv[0] === "help") return { exitCode: 0, output: usage };
    const args = parseArguments(argv);
    if (args.list) return { exitCode: 0, output: listScenarios() };
    const now = runtime.now ?? (() => new Date());
    const startedAt = now();
    const runId = args.runId ?? `run-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
    const rawReport = runSingleCalibrationScenarioEvaluators(
      JUNK_CALIBRATION_MANIFEST,
      args.scenarioId!,
      CANONICAL_JUNK_SCENARIO_PROVIDER,
      [
        (normalized) => evaluateProductionFixture(normalized.scenario.id, normalized.input),
        (normalized) => evaluateStructuralMetrics(normalized.scenario.id, normalized.input),
        (normalized) => evaluateOnePlyAll(normalized.scenario.id, normalized.input),
        (normalized) => evaluateTwoPlyAll(normalized.scenario.id, normalized.input),
        (normalized) => evaluateStructuralTwoPlyAll(normalized.scenario.id, normalized.input),
        (normalized) => evaluateStructuralBounded(normalized.scenario.id, normalized.input),
        (normalized) => evaluateIsolationBoundary(normalized.scenario.id, normalized.input),
      ],
      {
        runId,
        gitSha: runtime.gitSha ?? currentGitSha(),
        command: commandFor(argv),
        configHash: `${JUNK_CALIBRATION_MANIFEST.id}@${JUNK_CALIBRATION_MANIFEST.version}`,
        startedAt: startedAt.toISOString(),
        workerCount: 1,
      },
    );
    const baseline = args.baselinePath
      ? (JSON.parse(
          (runtime.read ?? ((filePath) => readFileSync(filePath, "utf8")))(args.baselinePath),
        ) as CalibrationBaseline)
      : undefined;
    const comparison = baseline
      ? compareCalibrationBaseline(
          baseline,
          rawReport.evaluations.find(({ evaluator }) => evaluator === baseline.evaluator) ??
            (() => {
              throw new Error(`EVALUATOR_RESULT_NOT_FOUND: ${baseline.evaluator}`);
            })(),
        )
      : undefined;
    const report = comparison ? { ...rawReport, baselineComparisons: [comparison] } : rawReport;
    const outputDir = path.resolve(args.outputDir);
    const jsonPath = path.join(outputDir, `junk-${runId}.json`);
    const markdownPath = path.join(outputDir, `junk-${runId}.md`);
    const exists = runtime.exists ?? existsSync;
    if (exists(jsonPath) || exists(markdownPath)) {
      throw new Error(`OUTPUT_ALREADY_EXISTS: ${runId}`);
    }
    (runtime.makeDirectory ?? ((directory) => mkdirSync(directory, { recursive: true })))(
      outputDir,
    );
    const write = runtime.write ?? ((filePath, content) => writeFileSync(filePath, content));
    write(jsonPath, serializeCalibrationReport(report));
    write(markdownPath, formatCalibrationSummary(report));
    return {
      exitCode:
        comparison?.status === "changed" ? 2 : comparison?.status === "incompatible" ? 1 : 0,
      output: `${formatCalibrationSummary(report)}json: ${jsonPath}\nmarkdown: ${markdownPath}\n`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  }
};
