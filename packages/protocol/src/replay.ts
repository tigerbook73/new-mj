import { z } from "zod";
import { GameEventSchema, PlayerViewBaseSchema } from "./game.ts";

/**
 * docs/process/phase-4.5-replay.md — query for a finished game's replay.
 * Ack-only (query = ack gives data): server resolves `gameNumber` against
 * the room's archived FinishedGameLog, checks the requester's userId was
 * seated in that game, then returns the seat-filtered event stream plus the
 * final reconstructed view (mirrors GameSnapshotSchema's shape, matching how
 * live play delivers an initial full view + incremental events).
 */
export const ReplayGetRequestSchema = z.object({
  roomId: z.string(),
  gameNumber: z.number(),
});
export type ReplayGetRequest = z.infer<typeof ReplayGetRequestSchema>;

export const ReplayGetResponseSchema = z.object({
  gameNumber: z.number(),
  finalView: PlayerViewBaseSchema,
  events: z.array(GameEventSchema),
});
export type ReplayGetResponse = z.infer<typeof ReplayGetResponseSchema>;
