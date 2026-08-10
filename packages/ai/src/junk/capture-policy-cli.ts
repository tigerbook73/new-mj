import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Convenience for the "two uncommitted experimental versions side by side"
 * workflow policy-loader.ts's doc comment describes: `pnpm capture:junk-policy
 * before` copies the current strategy module and its local dependencies into
 * packages/ai/.compare-scratch/before/junk/ *once*, then you keep editing
 * src/junk/ normally — no copy-then-restore dance, and no risk of putting the
 * copy somewhere tsconfig/eslint would sweep it up (must stay outside src/, see
 * policy-loader.ts's module doc comment). For comparing against *committed*
 * history, prefer policy-loader's --*-ref (git show, no manual copying needed)
 * — this script is only for versions that aren't commits yet.
 */

const usage = "Usage: junk/capture-policy-cli.ts <label>\n";

const junkSrcDir = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const policyFiles = ["strategy.ts", "default-weights.json", "tile-probability.ts"] as const;

const isValidLabel = (label: string): boolean =>
  label !== "." && label !== ".." && /^[a-zA-Z0-9._-]+$/.test(label);

export const runCaptureJunkPolicyCli = (
  argv: string[],
  log: (line: string) => void = (line) => process.stderr.write(line),
): { exitCode: number; output: string } => {
  const label = argv[0];
  if (!label || !isValidLabel(label)) {
    return { exitCode: 1, output: `INVALID_LABEL\n${usage}` };
  }
  const destination = path.join(packageRoot, ".compare-scratch", label, "junk");
  if (existsSync(destination)) {
    return { exitCode: 1, output: `DESTINATION_ALREADY_EXISTS: ${destination}\n${usage}` };
  }
  mkdirSync(destination, { recursive: true });
  for (const file of policyFiles) cpSync(path.join(junkSrcDir, file), path.join(destination, file));
  log(`[capture] copied Junk policy dependencies to ${destination}\n`);
  return {
    exitCode: 0,
    output:
      `Policy capture written to ${destination}\n` +
      "Compare against it later with, e.g.:\n" +
      `  pnpm compare:junk-weights --candidate-module ${destination}/strategy.ts --candidate x\n` +
      `  pnpm --filter @new-mj/ai evaluate policy diff --baseline-module ${destination}/strategy.ts\n`,
  };
};
