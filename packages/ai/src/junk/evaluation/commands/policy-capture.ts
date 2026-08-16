import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Convenience for the "two uncommitted experimental versions side by side"
 * workflow policy-loader.ts's doc comment describes: `evaluate policy capture
 * before` copies the current strategy module and its local dependencies into
 * packages/ai/.compare-scratch/before/junk/ *once*, then you keep editing
 * src/junk/ normally — no copy-then-restore dance, and no risk of putting the
 * copy somewhere tsconfig/eslint would sweep it up (must stay outside src/, see
 * policy-loader.ts's module doc comment). For comparing against *committed*
 * history, prefer policy-loader's --*-ref (git show, no manual copying needed)
 * — this script is only for versions that aren't commits yet.
 */

const usage = "Usage: pnpm --filter @new-mj/ai evaluate policy capture <label>\n";

const junkSrcDir = fileURLToPath(new URL("../../", import.meta.url));
const packageRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const policyFiles = [
  "strategy.ts",
  "structural-baseline.ts",
  "structural-claim.ts",
  "structural-discard.ts",
  "structural-routes.ts",
  "structural-turn.ts",
] as const;

const isValidLabel = (label: string): boolean =>
  label !== "." && label !== ".." && /^[a-zA-Z0-9._-]+$/.test(label);

export const runCaptureJunkPolicyCli = (
  argv: readonly string[],
  log: (line: string) => void = (line) => process.stderr.write(line),
  runtime: Readonly<{
    exists?: (filePath: string) => boolean;
    makeDirectory?: (directory: string) => void;
    copy?: (source: string, destination: string) => void;
  }> = {},
): { exitCode: number; output: string } => {
  if (argv.includes("--help")) return { exitCode: 0, output: usage };
  const label = argv[0];
  if (!label || argv.length !== 1 || !isValidLabel(label)) {
    return { exitCode: 1, output: `INVALID_LABEL\n${usage}` };
  }
  const destination = path.join(packageRoot, ".compare-scratch", label, "junk");
  if ((runtime.exists ?? existsSync)(destination)) {
    return { exitCode: 1, output: `DESTINATION_ALREADY_EXISTS: ${destination}\n${usage}` };
  }
  (runtime.makeDirectory ?? ((directory) => mkdirSync(directory, { recursive: true })))(
    destination,
  );
  const copy = runtime.copy ?? cpSync;
  for (const file of policyFiles) copy(path.join(junkSrcDir, file), path.join(destination, file));
  log(`[capture] copied Junk policy dependencies to ${destination}\n`);
  return {
    exitCode: 0,
    output:
      `Policy capture written to ${destination}\n` +
      "Compare against it later with, e.g.:\n" +
      `  pnpm --filter @new-mj/ai evaluate policy diff --baseline-module ${destination}/strategy.ts\n`,
  };
};
