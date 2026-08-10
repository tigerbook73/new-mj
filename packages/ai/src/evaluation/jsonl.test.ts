import { describe, expect, it } from "vitest";
import { parseCalibrationJsonl } from "./jsonl.ts";

describe("calibration JSONL reader", () => {
  it("parses independent records and skips blank lines", () => {
    const records = [
      ...parseCalibrationJsonl<{ value: number }>(
        '{"type":"header","schemaVersion":1,"manifestId":"m","manifestVersion":1,"shardId":"part-0000","shardIndex":0,"shardCount":1}\n\n' +
          '{"type":"scenario","schemaVersion":1,"scenarioId":"a","data":{"value":1}}\n' +
          '{"type":"scenario","schemaVersion":1,"scenarioId":"b","data":{"value":2}}',
      ),
    ];
    expect(records.map(({ scenarioId, data }) => [scenarioId, data.value])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(records[0]?.header.shardId).toBe("part-0000");
  });

  it("reports the source line for malformed records", () => {
    expect(() => [
      ...parseCalibrationJsonl('{"type":"scenario","schemaVersion":1,"scenarioId":"a"}'),
    ]).toThrow("INVALID_JSONL_HEADER");
  });

  it("rejects a record whose schema version differs from the header", () => {
    expect(() => [
      ...parseCalibrationJsonl(
        '{"type":"header","schemaVersion":1,"manifestId":"m","manifestVersion":1,"shardId":"part-0000","shardIndex":0}\n' +
          '{"type":"scenario","schemaVersion":2,"scenarioId":"a","data":{}}',
      ),
    ]).toThrow("INVALID_JSONL: line 2 has invalid scenario record");
  });
});
