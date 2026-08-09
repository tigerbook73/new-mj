import { createReadStream, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import type { TwoPlyBaselineCase, TwoPlyBaselineManifest } from "./two-ply-baseline.ts";

export const readTwoPlyBaselineManifest = (path: string): TwoPlyBaselineManifest =>
  JSON.parse(readFileSync(path, "utf8")) as TwoPlyBaselineManifest;

export async function* readTwoPlyBaselineCases(
  path: string,
): AsyncGenerator<TwoPlyBaselineCase, void, undefined> {
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (line.trim().length === 0) continue;
      yield JSON.parse(line) as TwoPlyBaselineCase;
    }
  } finally {
    lines.close();
    input.destroy();
  }
}
