#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  environmentLinkNames,
  firstAvailableWorktreeSlot,
  parseWorktreeSlot,
  worktreeConfigFor,
  worktreeEnvironment,
  type WorktreeConfig,
} from "./index.ts";

type Worktree = { root: string; branch?: string };

const usage = `Usage:
  worktree-cli create [lowercase-kebab-name] [slot]
  worktree-cli status
  worktree-cli doctor
  worktree-cli run <command> [...args]

Commands:
  create  Create a feature worktree; prompts for a name in an interactive terminal.
  status  List worktrees, slots, ports, and environment links.
  doctor  Report duplicate slots and broken environment links.
  run     Run a command with the current worktree's environment.`;

class CliUsageError extends Error {}

const printUsage = (stream: NodeJS.WriteStream): void => {
  stream.write(`${usage}\n`);
};

const run = (command: string, args: readonly string[], cwd: string, env = process.env): void => {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
};

const output = (command: string, args: readonly string[], cwd: string): string => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result.stdout.trim();
};

const repoRoot = (): string => output("git", ["rev-parse", "--show-toplevel"], process.cwd());
const configPath = (root: string): string => join(root, ".worktree.env");

const readConfig = (root: string): WorktreeConfig => {
  const path = configPath(root);
  if (!existsSync(path)) return worktreeConfigFor(0);
  const line = readFileSync(path, "utf8")
    .split("\n")
    .find((candidate) => candidate.startsWith("WORKTREE_SLOT="));
  return worktreeConfigFor(parseWorktreeSlot(line?.slice("WORKTREE_SLOT=".length)));
};

const writeConfig = (root: string, config: WorktreeConfig): void => {
  writeFileSync(configPath(root), `WORKTREE_SLOT=${config.slot}\n`, "utf8");
};

const worktrees = (root: string): Worktree[] => {
  const records = output("git", ["worktree", "list", "--porcelain"], root).split("\n\n");
  return records.map((record) => {
    const lines = record.split("\n");
    const rootLine = lines.find((line) => line.startsWith("worktree "));
    if (!rootLine) throw new Error(`invalid git worktree record: ${record}`);
    const branchLine = lines.find((line) => line.startsWith("branch "));
    const branch = branchLine?.slice("branch ".length);
    return {
      root: rootLine.slice("worktree ".length),
      ...(branch === undefined ? {} : { branch }),
    };
  });
};

const slotAssignments = (root: string) =>
  worktrees(root).map((worktree) => ({ ...worktree, config: readConfig(worktree.root) }));

const isGitIgnored = (root: string, name: string): boolean =>
  spawnSync("git", ["check-ignore", "--quiet", "--", name], { cwd: root }).status === 0;

const ignoredEnvironmentNames = (root: string): string[] =>
  environmentLinkNames(
    readdirSync(root, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      isLinkable: entry.isFile() || entry.isSymbolicLink(),
    })),
    (name) => isGitIgnored(root, name),
  );

const linkEnvironmentFiles = (sourceRoot: string, targetRoot: string): string[] => {
  const preserved: string[] = [];
  for (const name of ignoredEnvironmentNames(sourceRoot)) {
    const target = join(targetRoot, name);
    if (
      existsSync(target) ||
      (() => {
        try {
          lstatSync(target);
          return true;
        } catch {
          return false;
        }
      })()
    ) {
      preserved.push(name);
      continue;
    }
    symlinkSync(relative(targetRoot, join(sourceRoot, name)), target);
  }
  return preserved;
};

const printStatus = (root: string): void => {
  const assignments = slotAssignments(root);
  process.stdout.write(
    assignments
      .map(({ root: worktreeRoot, branch, config }) => {
        const environment = ignoredEnvironmentNames(worktreeRoot)
          .map((name) => {
            try {
              return lstatSync(join(worktreeRoot, name)).isSymbolicLink()
                ? name
                : `${name} (local)`;
            } catch {
              return `${name} (missing)`;
            }
          })
          .join(", ");
        return [
          `worktree: ${worktreeRoot}`,
          `branch: ${branch ?? "detached"}`,
          `slot: ${config.slot}`,
          `dev:  http://localhost:${config.devWebPort} -> http://localhost:${config.devServerPort}`,
          `e2e:  http://localhost:${config.e2eWebPort} -> http://localhost:${config.e2eServerPort}`,
          `env:  ${environment || "none"}`,
        ].join("\n");
      })
      .join("\n\n") + "\n",
  );
};

const doctor = (root: string): void => {
  const assignments = slotAssignments(root);
  const bySlot = new Map<number, string[]>();
  for (const assignment of assignments) {
    const roots = bySlot.get(assignment.config.slot) ?? [];
    roots.push(assignment.root);
    bySlot.set(assignment.config.slot, roots);
  }
  const duplicateSlots = [...bySlot.entries()].filter(([, roots]) => roots.length > 1);
  const brokenLinks = assignments.flatMap(({ root: worktreeRoot }) =>
    readdirSync(worktreeRoot, { withFileTypes: true })
      .filter((entry) => entry.name.startsWith(".env.") && entry.isSymbolicLink())
      .flatMap((entry) => {
        try {
          return existsSync(join(worktreeRoot, entry.name))
            ? []
            : [`${worktreeRoot}/${entry.name}`];
        } catch {
          return [`${worktreeRoot}/${entry.name}`];
        }
      }),
  );
  if (duplicateSlots.length || brokenLinks.length) {
    const details = [
      ...duplicateSlots.map(([slot, roots]) => `slot ${slot} is shared by ${roots.join(", ")}`),
      ...brokenLinks.map((path) => `broken environment link: ${path}`),
    ];
    throw new Error(`worktree doctor failed:\n${details.join("\n")}`);
  }
  process.stdout.write("worktree doctor: ok\n");
};

const validName = (name: string): boolean => /^[a-z0-9][a-z0-9-]*$/.test(name);

const promptForName = async (): Promise<string | undefined> => {
  if (!process.stdin.isTTY) return undefined;
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const name = (await readline.question("Worktree name (lowercase-kebab-name): ")).trim();
    return name || undefined;
  } finally {
    readline.close();
  }
};

const create = async (
  root: string,
  name: string | undefined,
  slotRaw: string | undefined,
): Promise<void> => {
  const requestedName = name ?? (await promptForName());
  if (!requestedName || !validName(requestedName))
    throw new CliUsageError("worktree name must be lowercase kebab-case");
  const assignments = slotAssignments(root);
  const claimedSlots = assignments.map(({ config }) => config.slot);
  const slot =
    slotRaw === undefined ? firstAvailableWorktreeSlot(claimedSlots) : parseWorktreeSlot(slotRaw);
  if (claimedSlots.includes(slot)) throw new Error(`worktree slot ${slot} is already in use`);
  const target = join(dirname(root), `new-mj-${requestedName}`);
  if (existsSync(target)) throw new Error(`target already exists: ${target}`);
  const primary = assignments[0];
  if (!primary)
    throw new Error("cannot find the primary worktree to use as the environment source");

  run("git", ["worktree", "add", "-b", `feat/${requestedName}`, target, "main"], root);
  writeConfig(target, worktreeConfigFor(slot));
  const preserved = linkEnvironmentFiles(primary.root, target);
  if (preserved.length)
    process.stdout.write(`preserved existing environment files: ${preserved.join(", ")}\n`);
  run("pnpm", ["install", "--frozen-lockfile"], target);
  run("pnpm", ["build"], target);
  printStatus(root);
};

const runWithWorktreeEnv = (root: string, args: readonly string[]): void => {
  const [command, ...commandArgs] = args;
  if (!command) throw new CliUsageError("run requires a command");
  const separator = commandArgs.indexOf("--");
  const normalizedArgs =
    separator === -1
      ? commandArgs
      : [...commandArgs.slice(0, separator), ...commandArgs.slice(separator + 1)];
  run(command, normalizedArgs, root, worktreeEnvironment(readConfig(root)));
};

const main = async (): Promise<void> => {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printUsage(process.stdout);
    return;
  }
  const root = repoRoot();
  switch (command) {
    case "create":
      await create(root, args[0], args[1]);
      return;
    case "status":
      printStatus(root);
      return;
    case "doctor":
      doctor(root);
      return;
    case "run":
      runWithWorktreeEnv(root, args);
      return;
    default:
      throw new CliUsageError(`unknown command: ${command}`);
  }
};

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`error: ${message}\n`);
  if (error instanceof CliUsageError) printUsage(process.stderr);
  process.exitCode = 1;
}
