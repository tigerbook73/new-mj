import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export type CalibrationJsonlRecord<T = unknown> = Readonly<{
  schemaVersion: number;
  scenarioId: string;
  data: T;
}>;

const parseLine = <T>(line: string, lineNumber: number): CalibrationJsonlRecord<T> => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(`INVALID_JSONL: line ${lineNumber} is not valid JSON`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_JSONL: line ${lineNumber} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (!Number.isInteger(record.schemaVersion) || typeof record.scenarioId !== "string") {
    throw new Error(`INVALID_JSONL: line ${lineNumber} requires schemaVersion and scenarioId`);
  }
  if (!("data" in record)) throw new Error(`INVALID_JSONL: line ${lineNumber} requires data`);
  return record as CalibrationJsonlRecord<T>;
};

/** Parses JSONL text without retaining the complete input; useful for unit tests and chunks. */
export function* parseCalibrationJsonl<T = unknown>(text: string): Generator<CalibrationJsonlRecord<T>> {
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    yield parseLine<T>(line, index + 1);
  }
}

/** Streams one validated record at a time from a JSONL file. */
export const readCalibrationJsonl = async function* <T = unknown>(
  filePath: string,
): AsyncGenerator<CalibrationJsonlRecord<T>> {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (line.trim() === "") continue;
      yield parseLine<T>(line, lineNumber);
    }
  } finally {
    lines.close();
    input.destroy();
  }
};
