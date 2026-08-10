import { createHash } from "node:crypto";

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
};

export const contentHashOf = (value: unknown): string =>
  `sha256:${createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex")}`;
