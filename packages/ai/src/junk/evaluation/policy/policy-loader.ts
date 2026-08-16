import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { JunkAction, JunkPlayerView } from "@new-mj/core";
import type { SeatPolicy } from "../match/arena.ts";

/**
 * Loads a `strategy.ts`-shaped module — either the current working tree's own
 * (default), an arbitrary file path (e.g. a hand-duplicated experimental copy
 * under packages/ai/.compare-scratch/, see AGENTS.md "两个都没提交的实验版本
 * 互相比"), or a committed git ref — as a SeatPolicy, so tools like
 * policy-diff.ts can compare across code versions using the same in-process self-play
 * machinery (`SeatPolicy` doesn't care where the function came from — see
 * arena.ts).
 *
 * The `ref` path snapshots via `git show` (no worktree, no `pnpm install`) into
 * a scratch dir *inside* packages/ai/ — bare specifiers like "@new-mj/core"
 * still resolve through this package's own node_modules (Node walks up looking
 * for node_modules from the importing file's location). This only works when
 * @new-mj/core's interface hasn't changed between `ref` and now; cross-core-
 * version comparisons aren't supported and aren't the intended use — "AI 改进类"
 * changes are expected to stay inside packages/ai (see packages/ai/AGENTS.md).
 */
export type PolicySource = Readonly<{
  /** Mutually exclusive with modulePath. */
  ref?: string;
  /** Mutually exclusive with ref. Defaults to this package's current ./strategy.ts. */
  modulePath?: string;
  /** Named policy export. Defaults to chooseJunkAction. */
  exportName?: string;
}>;

type PolicyFunction = (
  view: JunkPlayerView,
  legalActions: readonly JunkAction[],
) => JunkAction | undefined;

type StrategyModuleShape = Readonly<Record<string, unknown>> & {
  chooseJunkAction: PolicyFunction;
};

const packageRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const scratchRoot = path.join(packageRoot, ".compare-scratch");

const repoRoot = (): string =>
  execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

/**
 * Pulls every non-test, non-CLI file directly inside packages/ai/src/junk/ at
 * `ref` into a fresh scratch directory — enough for strategy.ts's own dependency
 * closure without a real dependency resolver. The Junk source root is restricted
 * to this production closure, so offline evaluation modules never tag along.
 */
const snapshotRefToScratch = (ref: string): string => {
  const root = repoRoot();
  const gitDir = "packages/ai/src/junk";
  const names = execFileSync("git", ["ls-tree", "--name-only", ref, `${gitDir}/`], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => path.basename(line))
    .filter((name) => !name.endsWith(".test.ts") && !name.endsWith("-cli.ts"));
  if (!names.includes("strategy.ts")) {
    throw new Error(`POLICY_SOURCE_MISSING_STRATEGY: ${ref} has no ${gitDir}/strategy.ts`);
  }
  mkdirSync(scratchRoot, { recursive: true });
  const scratchDir = mkdtempSync(
    path.join(scratchRoot, `${ref.replace(/[^a-zA-Z0-9._-]/g, "_")}-`),
  );
  for (const name of names) {
    const content = execFileSync("git", ["show", `${ref}:${gitDir}/${name}`], {
      cwd: root,
      encoding: "utf8",
    });
    writeFileSync(path.join(scratchDir, name), content);
  }
  return path.join(scratchDir, "strategy.ts");
};

const isStrategyModuleShape = (value: unknown): value is StrategyModuleShape =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Record<string, unknown>).chooseJunkAction === "function";

/**
 * The path-resolution half of loading a policy — snapshots `ref` via git if
 * given, resolves `modulePath`, or defaults to this package's current
 * ./strategy.ts. Synchronous and side-effect-bounded to (at most) one git
 * snapshot; deliberately separate from `buildPolicy` (which imports the
 * module) so a caller distributing work across worker_threads — see
 * policy-match-worker.ts — can resolve `ref` exactly once on the main thread
 * and hand every worker an already-materialized file path instead of each
 * worker redundantly re-running `git show`/snapshotting its own copy.
 */
export const resolveModulePath = (source: PolicySource): string => {
  if (source.ref && source.modulePath) {
    throw new Error("POLICY_SOURCE_AMBIGUOUS: pass ref or modulePath, not both");
  }
  if (source.ref) return snapshotRefToScratch(source.ref);
  if (source.modulePath) return path.resolve(source.modulePath);
  return fileURLToPath(new URL("../../strategy.ts", import.meta.url));
};

/**
 * The import half of loading a policy — given an already-resolved module path
 * (see resolveModulePath) and an optional weights-file override, imports the
 * module and returns a SeatPolicy. Callable from any thread (main or worker):
 * it never touches git, only `import()` and an optional local JSON read.
 */
export const buildPolicy = async (modulePath: string, exportName?: string): Promise<SeatPolicy> => {
  const imported: unknown = await import(pathToFileURL(modulePath).href);
  if (!isStrategyModuleShape(imported)) {
    throw new Error(`POLICY_SOURCE_INVALID_MODULE: ${modulePath} does not export chooseJunkAction`);
  }
  const selectedExport = exportName ?? "chooseJunkAction";
  const choose = imported[selectedExport];
  if (typeof choose !== "function") {
    throw new Error(
      `POLICY_SOURCE_INVALID_EXPORT: ${modulePath} does not export ${selectedExport}`,
    );
  }
  return (view, legalActions) => {
    const action = (choose as PolicyFunction)(view, legalActions);
    if (!action) throw new Error(`POLICY_RETURNED_NO_ACTION: ${selectedExport}`);
    return action;
  };
};

export const loadPolicy = async (
  source: PolicySource,
  label: string,
): Promise<{ policy: SeatPolicy; label: string; modulePath: string }> => {
  const modulePath = resolveModulePath(source);
  const policy = await buildPolicy(modulePath, source.exportName);
  return { policy, label, modulePath };
};
