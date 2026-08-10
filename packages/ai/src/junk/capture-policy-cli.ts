import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Convenience for the "two uncommitted experimental versions side by side"
 * workflow policy-loader.ts's doc comment describes: `pnpm capture:junk-policy
 * before` copies the current packages/ai/src/junk/ into
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
  for (const entry of readdirSync(junkSrcDir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.endsWith(".test.ts")) continue;
    cpSync(path.join(junkSrcDir, entry.name), path.join(destination, entry.name));
  }
  log(`[snapshot] copied packages/ai/src/junk/ (minus *.test.ts) to ${destination}\n`);
  return {
    exitCode: 0,
    output:
      `Snapshot written to ${destination}\n` +
      "Compare against it later with, e.g.:\n" +
      `  pnpm compare:junk-weights --candidate-module ${destination}/strategy.ts --candidate x\n` +
      `  pnpm decision-diff:junk --baseline-module ${destination}/strategy.ts\n`,
  };
};
