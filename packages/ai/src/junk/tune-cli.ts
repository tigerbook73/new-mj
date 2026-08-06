import { evaluateTunedWeights, formatTuneReport, tuneJunkWeights } from "./tune.ts";

type Arguments = {
  seed: number;
  generations: number;
  seedsPerGeneration: number;
  evalSeeds: number;
  initialSigma: number;
};

const usage =
  "Usage: junk/tune-cli.ts [--seed <int>] [--generations <int>] [--seeds-per-generation <int>] [--eval-seeds <int>] [--sigma <float>]\n";

const parseArguments = (argv: string[]): Arguments => {
  const result: Arguments = {
    seed: 1,
    generations: 10,
    seedsPerGeneration: 4,
    evalSeeds: 10,
    initialSigma: 0.15,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || value === undefined) throw new Error("MISSING_ARGUMENT_VALUE");
    if (flag === "--seed") result.seed = Number(value);
    else if (flag === "--generations") result.generations = Number(value);
    else if (flag === "--seeds-per-generation") result.seedsPerGeneration = Number(value);
    else if (flag === "--eval-seeds") result.evalSeeds = Number(value);
    else if (flag === "--sigma") result.initialSigma = Number(value);
    else throw new Error("UNKNOWN_ARGUMENT");
  }
  if (
    !Number.isInteger(result.seed) ||
    !Number.isInteger(result.generations) ||
    result.generations < 1 ||
    !Number.isInteger(result.seedsPerGeneration) ||
    result.seedsPerGeneration < 1 ||
    !Number.isInteger(result.evalSeeds) ||
    result.evalSeeds < 1 ||
    !(result.initialSigma > 0)
  ) {
    throw new Error("INVALID_NUMERIC_ARGUMENT");
  }
  return result;
};

export const runTuneCli = (argv: string[]): { exitCode: number; output: string } => {
  try {
    const args = parseArguments(argv);
    const report = tuneJunkWeights(args.seed, {
      generations: args.generations,
      seedsPerGeneration: args.seedsPerGeneration,
      initialSigma: args.initialSigma,
    });
    const finalEval = evaluateTunedWeights(args.seed, args.evalSeeds, report);
    return { exitCode: 0, output: `${formatTuneReport(report, finalEval, args)}\n` };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${error instanceof Error ? error.message : "UNKNOWN"}\n${usage}`,
    };
  }
};

const output = runTuneCli(process.argv.slice(2));
process.stdout.write(output.output);
process.exitCode = output.exitCode;
