import { describe, expect, it } from "vitest";
import { parseCalibrationJsonl } from "./jsonl.ts";

describe("calibration JSONL reader", () => {
  it("parses independent records and skips blank lines", () => {
    const records = [...parseCalibrationJsonl<{ value: number }>(
      '{"schemaVersion":1,"scenarioId":"a","data":{"value":1}}\n\n' +
        '{"schemaVersion":1,"scenarioId":"b","data":{"value":2}}',
    )];
    expect(records.map(({ scenarioId, data }) => [scenarioId, data.value])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("reports the source line for malformed records", () => {
    expect(() => [...parseCalibrationJsonl('{"schemaVersion":1,"scenarioId":"a"}')]).toThrow(
      "INVALID_JSONL: line 1 requires data",
    );
  });
});
