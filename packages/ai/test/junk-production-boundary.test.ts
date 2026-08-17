import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const junkRoot = fileURLToPath(new URL("../src/junk/", import.meta.url));
const productionFiles = [
  "bot-agent.ts",
  "strategy.ts",
  "structural-baseline.ts",
  "structural-claim.ts",
  "structural-discard.ts",
  "structural-routes.ts",
  "structural-turn.ts",
] as const;

describe("Junk production boundary", () => {
  it("keeps only production assets at the Junk source root", () => {
    const rootAssets = readdirSync(junkRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.endsWith(".test.ts"))
      .map((entry) => entry.name)
      .sort();
    expect(rootAssets).toEqual([...productionFiles].sort());
  });

  it("does not let production modules depend on offline evaluation tooling", () => {
    for (const file of productionFiles.filter((name) => name.endsWith(".ts"))) {
      expect(readFileSync(new URL(`../src/junk/${file}`, import.meta.url), "utf8")).not.toMatch(
        /from\s+["'][^"']*evaluation\//,
      );
    }
  });
});
