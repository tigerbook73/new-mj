import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

const rules = {
  "@new-mj/core": [],
  "@new-mj/protocol": [],
  "@new-mj/ai": ["@new-mj/core"],
  "@new-mj/server": ["@new-mj/core", "@new-mj/protocol", "@new-mj/ai"],
  "@new-mj/web": ["@new-mj/protocol"],
  "@new-mj/mobile": ["@new-mj/protocol"],
};

const files = await Array.fromAsync(glob("{packages,apps}/*/package.json"));
const violations = [];
for (const file of files) {
  const pkg = JSON.parse(await readFile(file, "utf8"));
  const allowed = new Set(rules[pkg.name] ?? []);
  const dependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };
  for (const dependency of Object.keys(dependencies)) {
    if (dependency.startsWith("@new-mj/") && !allowed.has(dependency)) {
      violations.push(`${pkg.name} -> ${dependency}`);
    }
  }
}
if (violations.length > 0) {
  throw new Error(`Dependency direction violations:\n${violations.join("\n")}`);
}
