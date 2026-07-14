import { fuzzJunkGames, playJunkGame } from "./simulate.ts";
import type { Action, JunkConfig, SeatId } from "./types.ts";

type Arguments = {
  command: "play" | "fuzz";
  seed: number;
  games: number;
  config: Partial<Omit<JunkConfig, "rulesetId">>;
  actions: Array<{ seat: SeatId; action: Action }>;
};

const usage =
  "Usage: cli.ts <play|fuzz> [--seed <integer>] [--games <integer>] [--config <json>] [--actions <json>]\n";

const parseJson = <T>(value: string, name: string): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`INVALID_${name.toUpperCase()}_JSON`);
  }
};

const parseArguments = (argv: string[]): Arguments => {
  const values = argv.filter((value) => value !== "--");
  const command = values[0];
  if (command !== "play" && command !== "fuzz") throw new Error("INVALID_COMMAND");
  const result: Arguments = { command, seed: 1, games: 1_000, config: {}, actions: [] };
  for (let index = 1; index < values.length; index += 2) {
    const flag = values[index];
    const value = values[index + 1];
    if (!flag || value === undefined) throw new Error("MISSING_ARGUMENT_VALUE");
    if (flag === "--seed") result.seed = Number(value);
    else if (flag === "--games") result.games = Number(value);
    else if (flag === "--config") result.config = parseJson<Arguments["config"]>(value, "config");
    else if (flag === "--actions")
      result.actions = parseJson<Arguments["actions"]>(value, "actions");
    else throw new Error("UNKNOWN_ARGUMENT");
  }
  if (!Number.isInteger(result.seed) || !Number.isInteger(result.games) || result.games < 1) {
    throw new Error("INVALID_NUMERIC_ARGUMENT");
  }
  return result;
};

export const runCli = (argv: string[]): { exitCode: number; output: string } => {
  try {
    const args = parseArguments(argv);
    if (args.command === "fuzz") {
      const failure = fuzzJunkGames(args.games, args.seed);
      return failure
        ? { exitCode: 1, output: `${JSON.stringify({ ok: false, ...failure })}\n` }
        : {
            exitCode: 0,
            output: `${JSON.stringify({ ok: true, games: args.games, seed: args.seed })}\n`,
          };
    }
    const result = playJunkGame(args.seed, args.config, args.actions);
    return "error" in result
      ? { exitCode: 1, output: `${JSON.stringify({ ok: false, ...result })}\n` }
      : {
          exitCode: 0,
          output: `${JSON.stringify({
            ok: true,
            seed: args.seed,
            config: args.config,
            actions: result.actions,
            result: result.state.result,
            seq: result.state.seq,
            eventCount: result.events.length,
          })}\n`,
        };
  } catch (error) {
    return {
      exitCode: 1,
      output: `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "UNKNOWN" })}\n${usage}`,
    };
  }
};

const output = runCli(process.argv.slice(2));
process.stdout.write(output.output);
process.exitCode = output.exitCode;
