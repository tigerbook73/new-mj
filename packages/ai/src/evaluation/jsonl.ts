import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export type CalibrationJsonlHeader = Readonly<{
  type: "header";
  schemaVersion: number;
  manifestId: string;
  manifestVersion: number;
  shardId: string;
  shardIndex: number;
  shardCount?: number;
}>;

export type CalibrationJsonlRecord<T = unknown> = Readonly<{
  type: "scenario";
  schemaVersion: number;
  scenarioId: string;
  data: T;
  header: CalibrationJsonlHeader;
}>;

const parseValue = (line: string, lineNumber: number): Record<string, unknown> => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(`INVALID_JSONL: line ${lineNumber} is not valid JSON`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_JSONL: line ${lineNumber} must be an object`);
  }
  return value as Record<string, unknown>;
};

const parseHeader = (record: Record<string, unknown>, lineNumber: number): CalibrationJsonlHeader => {
  const shardIndex = record.shardIndex;
  const shardCount = record.shardCount;
  if (
    record.type !== "header" ||
    !Number.isInteger(record.schemaVersion) ||
    typeof record.manifestId !== "string" ||
    !Number.isInteger(record.manifestVersion) ||
    typeof record.shardId !== "string" ||
    !Number.isInteger(shardIndex) ||
    (shardCount !== undefined && !Number.isInteger(shardCount))
  ) {
    throw new Error(`INVALID_JSONL_HEADER: line ${lineNumber} has invalid header fields`);
  }
  if (
    typeof shardIndex !== "number" ||
    shardIndex < 0 ||
    (shardCount !== undefined && (typeof shardCount !== "number" || shardCount <= 0))
  ) {
    throw new Error(`INVALID_JSONL_HEADER: line ${lineNumber} has invalid shard values`);
  }
  return record as CalibrationJsonlHeader;
};

const parseRecord = <T>(
  record: Record<string, unknown>,
  lineNumber: number,
  header: CalibrationJsonlHeader,
): CalibrationJsonlRecord<T> => {
  if (
    record.type !== "scenario" ||
    record.schemaVersion !== header.schemaVersion ||
    typeof record.scenarioId !== "string" ||
    !("data" in record)
  ) {
    throw new Error(`INVALID_JSONL: line ${lineNumber} has invalid scenario record`);
  }
  return { ...record, header } as CalibrationJsonlRecord<T>;
};

/** Parses JSONL text; the first non-empty line is a file header. */
export function* parseCalibrationJsonl<T = unknown>(text: string): Generator<CalibrationJsonlRecord<T>> {
  const lines = text.split(/\r?\n/);
  let header: CalibrationJsonlHeader | undefined;
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    const record = parseValue(line, index + 1);
    if (!header) {
      header = parseHeader(record, index + 1);
      continue;
    }
    yield parseRecord<T>(record, index + 1, header);
  }
  if (!header) throw new Error("INVALID_JSONL_HEADER: file is empty");
}

/** Streams one validated record at a time from a JSONL file. */
export const readCalibrationJsonl = async function* <T = unknown>(
  filePath: string,
): AsyncGenerator<CalibrationJsonlRecord<T>> {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  let header: CalibrationJsonlHeader | undefined;
  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (line.trim() === "") continue;
      const record = parseValue(line, lineNumber);
      if (!header) {
        header = parseHeader(record, lineNumber);
        continue;
      }
      yield parseRecord<T>(record, lineNumber, header);
    }
    if (!header) throw new Error("INVALID_JSONL_HEADER: file is empty");
  } finally {
    lines.close();
    input.destroy();
  }
};
