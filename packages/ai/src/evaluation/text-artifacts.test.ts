import { describe, expect, it } from "vitest";
import { writeTextEvaluationArtifacts } from "./text-artifacts.ts";

const artifact = {
  run: {
    schemaVersion: 1 as const,
    runId: "diff-001",
    command: "evaluate policy diff",
    gitSha: "abc1234",
    startedAt: "2026-08-10T00:00:00.000Z",
  },
  data: { decisionPoints: 10, divergenceCount: 2 },
};

describe("text evaluation artifacts", () => {
  it("writes stable machine and human reports without overwriting", () => {
    const files = new Map<string, string>();
    const result = writeTextEvaluationArtifacts(
      "/tmp/evaluation-artifacts",
      "junk-policy-diff-001",
      artifact,
      "report",
      {
        exists: (filePath) => files.has(filePath),
        makeDirectory: () => undefined,
        write: (filePath, content) => files.set(filePath, content),
      },
    );

    expect(result).toEqual({
      jsonPath: "/tmp/evaluation-artifacts/junk-policy-diff-001.json",
      textPath: "/tmp/evaluation-artifacts/junk-policy-diff-001.txt",
    });
    expect(files.get(result.jsonPath)).toContain('"decisionPoints": 10');
    expect(files.get(result.textPath)).toBe("report\n");
    expect(() =>
      writeTextEvaluationArtifacts(
        "/tmp/evaluation-artifacts",
        "junk-policy-diff-001",
        artifact,
        "report",
        {
          exists: (filePath) => files.has(filePath),
        },
      ),
    ).toThrow("OUTPUT_ALREADY_EXISTS");
  });
});
