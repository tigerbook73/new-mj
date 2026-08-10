import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_JUNK_FIXTURES, JUNK_CALIBRATION_MANIFEST } from "./canonical-fixtures.ts";
import { createJunkFixtureProvider } from "./fixture-provider.ts";
import { formatCalibrationSummary, serializeCalibrationReport } from "./report.ts";
import { evaluateProductionFixture } from "./production-evaluator.ts";
import { runSingleCalibrationScenario } from "./runner.ts";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const defaultOutputDir = path.join(packageRoot, ".calibration-runs");
const usage =
  "Usage: pnpm --filter @new-mj/ai evaluate <command> [options]\n\n" +
  "Commands:\n" +
  "  --list                                      List available calibration scenarios\n" +
  "  --scenario <id>                             Run one scenario\n\n" +
  "Options:\n" +
  "  --output-dir <dir>                          Write JSON/Markdown reports here\n" +
  "                                              (default: packages/ai/.calibration-runs)\n" +
  "  --run-id <id>                               Stable report filename prefix\n" +
  "  --help                                      Show this help\n\n" +
  "Examples:\n" +
  "  pnpm --filter @new-mj/ai evaluate --list\n" +
  "  pnpm --filter @new-mj/ai evaluate --scenario canonical-production-selection-001\n";

type Arguments = Readonly<{
  list: boolean;
  scenarioId?: string;
  outputDir: string;
  runId?: string;
}>;

type Runtime = Readonly<{
  now?: () => Date;
  gitSha?: string;
  exists?: (filePath: string) => boolean;
  write?: (filePath: string, content: string) => void;
  makeDirectory?: (directory: string) => void;
}>;

const parseArguments = (argv: readonly string[]): Arguments => {
  let list = false;
  let scenarioId: string | undefined;
  let outputDir = defaultOutputDir;
  let runId: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--list") list = true;
    else if (flag === "--scenario") scenarioId = argv[++index];
    else if (flag === "--output-dir") outputDir = argv[++index] ?? "";
    else if (flag === "--run-id") runId = argv[++index];
    else if (flag === "--help") throw new Error(usage);
    else throw new Error(`UNKNOWN_ARGUMENT: ${flag}`);
  }
  if (!list && !scenarioId) throw new Error("MISSING_SCENARIO\n" + usage);
  if (list && scenarioId) throw new Error("LIST_AND_SCENARIO_ARE_MUTUALLY_EXCLUSIVE");
  if (!outputDir) throw new Error("MISSING_OUTPUT_DIR");
  if (runId !== undefined && !/^[a-zA-Z0-9._-]+$/.test(runId)) {
    throw new Error("INVALID_RUN_ID");
  }
  return { list, ...(scenarioId ? { scenarioId } : {}), outputDir, ...(runId ? { runId } : {}) };
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
    ...JUNK_CALIBRATION_MANIFEST.scenarios.map(
      (scenario) => `- ${scenario.id} (${scenario.source.kind}, seed=${scenario.seed})`,
    ),
  ].join("\n") + "\n";

export const runCalibrationCli = (
  argv: readonly string[],
  runtime: Runtime = {},
): { exitCode: number; output: string } => {
  try {
    if (argv.includes("--help")) return { exitCode: 0, output: usage };
    const args = parseArguments(argv);
    if (args.list) return { exitCode: 0, output: listScenarios() };
    const now = runtime.now ?? (() => new Date());
    const startedAt = now();
    const runId = args.runId ?? `run-${startedAt.toISOString().replace(/[:.]/g, "-")}`;
    const provider = createJunkFixtureProvider(CANONICAL_JUNK_FIXTURES);
    const report = runSingleCalibrationScenario(
      JUNK_CALIBRATION_MANIFEST,
      args.scenarioId!,
      provider,
      (normalized) => evaluateProductionFixture(normalized.scenario.id, normalized.input),
      {
        runId,
        gitSha: runtime.gitSha ?? currentGitSha(),
        command: commandFor(argv),
        configHash: `${JUNK_CALIBRATION_MANIFEST.id}@${JUNK_CALIBRATION_MANIFEST.version}`,
        startedAt: startedAt.toISOString(),
        workerCount: 1,
      },
    );
    const outputDir = path.resolve(args.outputDir);
    const jsonPath = path.join(outputDir, `${runId}.json`);
    const markdownPath = path.join(outputDir, `${runId}.md`);
    const exists = runtime.exists ?? existsSync;
    if (exists(jsonPath) || exists(markdownPath)) {
      throw new Error(`OUTPUT_ALREADY_EXISTS: ${runId}`);
    }
    (runtime.makeDirectory ?? ((directory) => mkdirSync(directory, { recursive: true })))(outputDir);
    const write = runtime.write ?? ((filePath, content) => writeFileSync(filePath, content));
    write(jsonPath, serializeCalibrationReport(report));
    write(markdownPath, formatCalibrationSummary(report));
    return {
      exitCode: 0,
      output: `${formatCalibrationSummary(report)}json: ${jsonPath}\nmarkdown: ${markdownPath}\n`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  }
};
