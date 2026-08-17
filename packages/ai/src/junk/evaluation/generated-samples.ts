import { STANDARD_TILE_SET, createPrng, createWall, nextUint32, type TileId } from "@new-mj/core";
import type { CalibrationManifest, CalibrationScenario } from "../../evaluation/types.ts";
import type { CalibrationJsonlHeader } from "../../evaluation/jsonl.ts";
import { contentHashOf } from "./hash.ts";
import {
  normalizeJunkGeneratedDecision,
  type JunkProductionSnapshotData,
} from "./snapshot-provider.ts";

export const JUNK_GENERATOR_VERSION = "standard-concealed-v1";

type GeneratedSample = Readonly<{
  scenario: CalibrationScenario;
  data: JunkProductionSnapshotData;
}>;

export type GeneratedSampleSet = Readonly<{
  manifest: CalibrationManifest;
  samples: readonly GeneratedSample[];
}>;

type GenerateOptions = Readonly<{
  seed: number;
  count: number;
  shardIndex?: number;
  shardCount?: number;
}>;

const assertInteger = (value: number, name: string, minimum: number): void => {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`INVALID_${name}`);
};

const tileRef = (tile: TileId) => ({
  kind: STANDARD_TILE_SET.kindOf(tile),
  copy: tile % STANDARD_TILE_SET.copiesPerKind,
});

const handShapeKey = (hand: readonly TileId[]): string => {
  const counts = new Uint8Array(STANDARD_TILE_SET.kinds.length);
  for (const tile of hand) counts[Math.floor(tile / STANDARD_TILE_SET.copiesPerKind)]! += 1;
  return [...counts].join("");
};

export const generateJunkSampleData = (seed: number): JunkProductionSnapshotData => {
  const hand = createWall(createPrng(seed))
    .wall.slice(0, 14)
    .sort((left, right) => left - right);
  const refs = hand.map(tileRef);
  return {
    view: {
      seat: 0,
      hand: refs,
      wallCount: 83,
      currentSeat: 0,
      dealer: 0,
      phase: "playing",
      seats: [
        { handCount: 14, melds: [], discards: [], justDrawn: true },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
        { handCount: 13, melds: [], discards: [], justDrawn: false },
      ],
      justDrawn: refs.at(-1)!,
    },
    legalActions: refs.map((tile) => ({ type: "discard", tile })),
  };
};

/** Generates globally deduplicated samples before stable modulo sharding. */
export const generateJunkSamples = ({
  seed,
  count,
  shardIndex = 0,
  shardCount = 1,
}: GenerateOptions): GeneratedSampleSet => {
  assertInteger(seed, "SEED", 0);
  assertInteger(count, "SAMPLE_COUNT", 1);
  assertInteger(shardIndex, "SHARD_INDEX", 0);
  assertInteger(shardCount, "SHARD_COUNT", 1);
  if (shardIndex >= shardCount) throw new Error("INVALID_SHARD_INDEX");

  const accepted: GeneratedSample[] = [];
  const shapes = new Set<string>();
  let prng = createPrng(seed);
  const attemptLimit = Math.max(count * 100, 1_000);
  for (let attempts = 0; accepted.length < count && attempts < attemptLimit; attempts += 1) {
    const next = nextUint32(prng);
    prng = next.prng;
    const data = generateJunkSampleData(next.value);
    const ids = data.view.hand.map(
      ({ kind, copy }) =>
        STANDARD_TILE_SET.kindIndexOf(kind) * STANDARD_TILE_SET.copiesPerKind + copy,
    );
    const shapeKey = handShapeKey(ids);
    if (shapes.has(shapeKey)) continue;
    shapes.add(shapeKey);
    const index = accepted.length;
    const id = `generated-${String(index).padStart(6, "0")}`;
    accepted.push({
      scenario: {
        id,
        version: 1,
        source: { kind: "generated", seed: next.value, generatorVersion: JUNK_GENERATOR_VERSION },
        description: "Deterministic concealed standard-hand discard sample.",
        tags: ["standard-only", "generated", "concealed"],
      },
      data,
    });
  }
  if (accepted.length !== count) throw new Error("UNABLE_TO_GENERATE_UNIQUE_SAMPLES");

  return {
    manifest: {
      schemaVersion: 1,
      id: `junk-generated-${seed}`,
      version: 1,
      purpose: "generated-scan",
      description: `Deterministic ${JUNK_GENERATOR_VERSION} samples from seed ${seed}.`,
      scenarios: accepted.map(({ scenario }) => scenario),
    },
    samples: accepted.filter((_, index) => index % shardCount === shardIndex),
  };
};

export const normalizeGeneratedJunkSample = (
  scenario: CalibrationScenario,
  data: JunkProductionSnapshotData,
) => {
  if (
    scenario.source.kind !== "generated" ||
    scenario.source.generatorVersion !== JUNK_GENERATOR_VERSION
  ) {
    throw new Error("UNSUPPORTED_GENERATOR_VERSION");
  }
  if (contentHashOf(data) !== contentHashOf(generateJunkSampleData(scenario.source.seed))) {
    throw new Error("GENERATED_SAMPLE_SEED_MISMATCH");
  }
  return normalizeJunkGeneratedDecision(scenario, data);
};

export const serializeGeneratedSamples = (
  set: GeneratedSampleSet,
  shardIndex: number,
  shardCount: number,
): string => {
  const header: CalibrationJsonlHeader = {
    type: "header",
    schemaVersion: set.manifest.schemaVersion,
    manifestId: set.manifest.id,
    manifestVersion: set.manifest.version,
    shardId: `part-${String(shardIndex).padStart(4, "0")}`,
    shardIndex,
    shardCount,
  };
  return `${[
    header,
    ...set.samples.map(({ scenario, data }) => ({
      type: "scenario",
      schemaVersion: 1,
      scenarioId: scenario.id,
      data,
    })),
  ]
    .map((record) => JSON.stringify(record))
    .join("\n")}\n`;
};
