import { z } from "zod";
import { SeatIdSchema } from "./common.ts";

/** Mirrors core's EventVisibility without importing core into the transport package. */
export const EventVisibilitySchema = z.union([
  z.object({ type: z.literal("public") }),
  z.object({ type: z.literal("seat"), seats: z.array(SeatIdSchema) }),
]);
export type EventVisibility = z.infer<typeof EventVisibilitySchema>;

/** Ruleset-private payload; only the envelope is a cross-ruleset contract. */
export const GameEventSchema = z.object({
  seq: z.number(),
  visibility: EventVisibilitySchema,
  payload: z.unknown(),
});
export type GameEvent = z.infer<typeof GameEventSchema>;

export const GameEventEnvelopeSchema = z.object({
  event: GameEventSchema,
  deadline: z.number().optional(),
});
export type GameEventEnvelope = z.infer<typeof GameEventEnvelopeSchema>;

/** Mirrors core's PlayerViewBase; ruleset-specific fields pass through as unknown extra keys. */
export const PlayerViewBaseSchema = z
  .object({
    seat: SeatIdSchema,
    hand: z.array(z.number()),
    seats: z.array(z.object({ handCount: z.number() })),
    wallCount: z.number(),
    currentSeat: SeatIdSchema,
  })
  .catchall(z.unknown());
export type PlayerViewBase = z.infer<typeof PlayerViewBaseSchema>;

export const GameSnapshotSchema = z.object({
  view: PlayerViewBaseSchema,
  seq: z.number(),
  deadline: z.number().optional(),
});
export type GameSnapshot = z.infer<typeof GameSnapshotSchema>;
