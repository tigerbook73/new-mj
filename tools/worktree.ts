import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

type WorktreeConfig = {
  slot: number;
  devServerPort: number;
  devWebPort: number;
  e2eServerPort: number;
  e2eWebPort: number;
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

const parseSlot = (raw: string | undefined): number => {
  const slot = raw ? Number(raw) : 0;
  if (!Number.isInteger(slot) || slot < 0 || slot > 99)
    throw new Error(`worktree slot must be an integer from 0 to 99; received ${raw}`);
  return slot;
};

const configFor = (slot: number): WorktreeConfig => ({
  slot,
  devServerPort: 3000 + slot,
  devWebPort: 5173 + slot,
  e2eServerPort: 3100 + slot,
  e2eWebPort: 5274 + slot,
});

const configPath = (root: string): string => join(root, ".worktree.env");

const readConfig = (root: string): WorktreeConfig => {
  const path = configPath(root);
  if (!existsSync(path)) return configFor(0);
  const line = readFileSync(path, "utf8")
    .split("\n")
    .find((candidate) => candidate.startsWith("WORKTREE_SLOT="));
  return configFor(parseSlot(line?.slice("WORKTREE_SLOT=".length)));
};

const writeConfig = (root: string, config: WorktreeConfig): void => {
  writeFileSync(configPath(root), `WORKTREE_SLOT=${config.slot}\n`, "utf8");
};

const envFor = (config: WorktreeConfig): NodeJS.ProcessEnv => ({
  ...process.env,
  PORT: String(config.devServerPort),
  VITE_PORT: String(config.devWebPort),
  VITE_SERVER_URL: `http://localhost:${config.devServerPort}`,
  E2E_SERVER_PORT: String(config.e2eServerPort),
  E2E_WEB_PORT: String(config.e2eWebPort),
  E2E_WORKERS: "1",
});

const printStatus = (root: string): void => {
  const config = readConfig(root);
  process.stdout.write(
    [
      `worktree: ${root}`,
      `slot: ${config.slot}`,
      `dev:  http://localhost:${config.devWebPort} -> http://localhost:${config.devServerPort}`,
      `e2e:  http://localhost:${config.e2eWebPort} -> http://localhost:${config.e2eServerPort}`,
      "",
    ].join("\n"),
  );
};

const validName = (name: string): boolean => /^[a-z0-9][a-z0-9-]*$/.test(name);

const create = (root: string, name: string | undefined, slotRaw: string | undefined): void => {
  if (!name || !validName(name))
    throw new Error("usage: pnpm worktree:new <lowercase-kebab-name> [slot]");
  const config = configFor(parseSlot(slotRaw));
  const target = join(dirname(root), `new-mj-${name}`);
  if (existsSync(target)) throw new Error(`target already exists: ${target}`);

  run("git", ["worktree", "add", "-b", `feat/${name}`, target, "main"], root);
  writeConfig(target, config);

  const sourceEnv = join(root, ".env.development.local");
  const targetEnv = join(target, ".env.development.local");
  if (existsSync(sourceEnv) && !existsSync(targetEnv))
    symlinkSync(relative(target, sourceEnv), targetEnv);

  run("pnpm", ["install", "--frozen-lockfile"], target);
  run("pnpm", ["build"], target);
  printStatus(target);
};

const main = (): void => {
  const [command, ...args] = process.argv.slice(2);
  const root = repoRoot();
  switch (command) {
    case "create":
      create(root, args[0], args[1]);
      return;
    case "status":
      printStatus(root);
      return;
    case "dev":
      run("pnpm", ["dev"], root, envFor(readConfig(root)));
      return;
    case "test-e2e":
      run(
        "pnpm",
        ["exec", "turbo", "run", "test:e2e", ...(args[0] === "--" ? args.slice(1) : args)],
        root,
        envFor(readConfig(root)),
      );
      return;
    default:
      throw new Error("usage: worktree.ts <create|status|dev|test-e2e>");
  }
};

main();
