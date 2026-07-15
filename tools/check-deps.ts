import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

const rules: Record<string, readonly string[]> = {
  "@new-mj/core": [],
  "@new-mj/protocol": [],
  "@new-mj/ai": ["@new-mj/core"],
  "@new-mj/server": ["@new-mj/core", "@new-mj/protocol", "@new-mj/ai"],
  "@new-mj/web": ["@new-mj/protocol"],
  "@new-mj/mobile": ["@new-mj/protocol"],
};

const main = async (): Promise<void> => {
  const violations: string[] = [];
  for await (const file of glob("{packages,apps}/*/package.json")) {
    const pkg = JSON.parse(await readFile(file, "utf8")) as {
      name: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const allowed = new Set(rules[pkg.name] ?? []);
    const dependencies = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    for (const dependency of Object.keys(dependencies)) {
      if (dependency.startsWith("@new-mj/") && !allowed.has(dependency)) {
        violations.push(`${pkg.name} -> ${dependency}`);
      }
    }
  }
  if (violations.length > 0)
    throw new Error(`Dependency direction violations:\n${violations.join("\n")}`);
};

main().catch((error: unknown) => {
  throw error;
});
