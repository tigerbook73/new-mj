export type EvaluationCommandResult = Readonly<{ exitCode: number; output: string }>;

export type EvaluationCommand = Readonly<{
  path: readonly [string, ...string[]];
  summary: string;
  run: (argv: readonly string[]) => EvaluationCommandResult | Promise<EvaluationCommandResult>;
}>;

export type EvaluationCommandRegistry = Readonly<{
  dispatch: (argv: readonly string[]) => Promise<EvaluationCommandResult>;
  help: (path?: readonly string[]) => string;
}>;

const startsWith = (value: readonly string[], prefix: readonly string[]): boolean =>
  prefix.every((part, index) => value[index] === part);

export const createEvaluationCommandRegistry = (
  commands: readonly EvaluationCommand[],
): EvaluationCommandRegistry => {
  const sorted = [...commands].sort(
    (left, right) =>
      right.path.length - left.path.length ||
      left.path.join(" ").localeCompare(right.path.join(" ")),
  );

  const help = (path: readonly string[] = []): string => {
    const visible = commands
      .filter((command) => startsWith(command.path, path))
      .sort((left, right) => left.path.join(" ").localeCompare(right.path.join(" ")));
    const heading = path.length === 0 ? "evaluate" : `evaluate ${path.join(" ")}`;
    if (visible.length === 0) return `Unknown command group: ${heading}\n`;
    return [
      `Usage: ${heading} <command> [options]`,
      "",
      "Commands:",
      ...visible.map(
        (command) => `  ${command.path.slice(path.length).join(" ").padEnd(20)} ${command.summary}`,
      ),
      "",
      `Run '${heading} <command> --help' for command-specific options.`,
      "",
    ].join("\n");
  };

  const dispatch = async (argv: readonly string[]): Promise<EvaluationCommandResult> => {
    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "help")
      return { exitCode: 0, output: help() };

    const command = sorted.find(({ path }) => startsWith(argv, path));
    if (command) return command.run(argv.slice(command.path.length));

    if (argv.at(-1) === "--help") {
      const path = argv.slice(0, -1);
      if (commands.some((candidate) => startsWith(candidate.path, path)))
        return { exitCode: 0, output: help(path) };
    }

    return { exitCode: 1, output: `Unknown command: evaluate ${argv.join(" ")}\n\n${help()}` };
  };

  return { dispatch, help };
};
