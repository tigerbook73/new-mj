import { describe, expect, it } from "vitest";
import { runArenaCli } from "./arena-cli.ts";

describe("runArenaCli", () => {
  it("writes an aggregate arena report through an injected pool", async () => {
    const files = new Map<string, string>();
    const result = await runArenaCli(
      [
        "--matches",
        "2",
        "--rounds",
        "1",
        "--output-dir",
        "/tmp/arena-cli",
        "--run-id",
        "arena-001",
      ],
      {
        now: () => new Date("2026-08-10T00:00:00.000Z"),
        gitSha: () => "abc123",
        exists: (filePath) => files.has(filePath),
        makeDirectory: () => undefined,
        write: (filePath, content) => files.set(filePath, content),
        createPool: () => ({
          runAll: async (tasks) =>
            tasks.map((task, index) => ({
              ok: true as const,
              seed: task.seed,
              scores: index === 0 ? ([3, 1, -1, -3] as const) : ([-3, -1, 1, 3] as const),
              ranking: index === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0],
            })),
          close: async () => undefined,
        }),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("2/2 successful");
    const json = files.get("/tmp/arena-cli/junk-arena-arena-001.json");
    expect(json).toBeDefined();
    expect(JSON.parse(json!).data).toMatchObject({
      successfulMatches: 2,
      totalScores: [0, 0, 0, 0],
      placements: [
        [1, 0, 0, 1],
        [0, 1, 1, 0],
        [0, 1, 1, 0],
        [1, 0, 0, 1],
      ],
    });
  });

  it("shows help without creating workers", async () => {
    let created = false;
    const result = await runArenaCli(["--help"], {
      createPool: () => {
        created = true;
        throw new Error("unexpected");
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("evaluate arena run");
    expect(created).toBe(false);
  });
});
