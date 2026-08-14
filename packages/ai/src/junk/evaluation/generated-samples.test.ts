import { describe, expect, it } from "vitest";
import { parseCalibrationJsonl } from "../../evaluation/jsonl.ts";
import {
  generateJunkSamples,
  normalizeGeneratedJunkSample,
  serializeGeneratedSamples,
} from "./generated-samples.ts";

describe("generated structural-calibration samples", () => {
  it("is deterministic, legal, unique by hand shape, and self-contained", () => {
    const left = generateJunkSamples({ seed: 17, count: 8 });
    const right = generateJunkSamples({ seed: 17, count: 8 });
    expect(left).toEqual(right);
    expect(new Set(left.manifest.scenarios.map(({ id }) => id)).size).toBe(8);

    for (const [index, sample] of left.samples.entries()) {
      expect(sample.scenario).toEqual(left.manifest.scenarios[index]);
      const normalized = normalizeGeneratedJunkSample(sample.scenario, sample.data);
      expect(normalized.input.view.hand).toHaveLength(14);
      expect(normalized.input.legalActions).toHaveLength(14);
      expect(new Set(normalized.input.view.hand).size).toBe(14);
    }

    const records = [...parseCalibrationJsonl(serializeGeneratedSamples(left, 0, 1))];
    expect(records).toHaveLength(8);
    expect(records[0]?.header).toMatchObject({ shardIndex: 0, shardCount: 1 });
  });

  it("rejects data that does not match its declared seed", () => {
    const set = generateJunkSamples({ seed: 31, count: 2 });
    expect(() =>
      normalizeGeneratedJunkSample(set.samples[0]!.scenario, set.samples[1]!.data),
    ).toThrow("GENERATED_SAMPLE_SEED_MISMATCH");
  });

  it("partitions only after global deduplication", () => {
    const all = generateJunkSamples({ seed: 29, count: 11 });
    const shards = [0, 1, 2].flatMap(
      (shardIndex) =>
        generateJunkSamples({ seed: 29, count: 11, shardIndex, shardCount: 3 }).samples,
    );
    expect(new Set(shards.map(({ scenario }) => scenario.id)).size).toBe(11);
    expect(shards.map(({ scenario }) => scenario.id).sort()).toEqual(
      all.samples.map(({ scenario }) => scenario.id).sort(),
    );
  });
});
