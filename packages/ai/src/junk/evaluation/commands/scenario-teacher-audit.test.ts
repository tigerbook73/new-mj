import { describe, expect, it } from "vitest";
import { runStructuralTeacherAuditCli } from "./scenario-teacher-audit.ts";

describe("scenario teacher-audit CLI", () => {
  it("writes a reproducible paired audit artifact", () => {
    const files = new Map<string, string>();
    const result = runStructuralTeacherAuditCli(
      [
        "--development-seed",
        "101",
        "--held-out-seed",
        "202",
        "--count",
        "1",
        "--run-id",
        "teacher-test",
        "--output-dir",
        "/tmp/teacher-test",
      ],
      {
        now: () => new Date("2026-08-16T00:00:00.000Z"),
        gitSha: () => "abc1234",
        exists: (filePath) => files.has(filePath),
        makeDirectory: () => undefined,
        write: (filePath, content) => files.set(filePath, content),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("bounded-structural-teacher-v1");
    expect(result.output).toContain("not a hand-theory, win-rate, wall-truth, or EV claim");
    expect(files.get("/tmp/teacher-test/junk-teacher-test.json")).toContain(
      '"minimumAgreementRate": 0.99',
    );
  });
});
