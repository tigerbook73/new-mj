import { z } from "zod";
import { RoomParticipantSchema, RoomSummarySchema, SessionResultSchema } from "./room-models.ts";
import { SeatIdSchema } from "./common.ts";

export const RoomPlayerJoinedEventSchema = z.object({
  seat: SeatIdSchema,
  nickname: z.string(),
  isBot: z.boolean(),
  avatar: z.string().optional(),
});
export type RoomPlayerJoinedEvent = z.infer<typeof RoomPlayerJoinedEventSchema>;

export const RoomParticipantJoinedEventSchema = z.object({ participant: RoomParticipantSchema });
export type RoomParticipantJoinedEvent = z.infer<typeof RoomParticipantJoinedEventSchema>;

export const RoomParticipantLeftEventSchema = z.object({ userId: z.string() });
export type RoomParticipantLeftEvent = z.infer<typeof RoomParticipantLeftEventSchema>;

export const RoomReadyChangedEventSchema = z.object({
  seat: SeatIdSchema,
  ready: z.boolean(),
});
export type RoomReadyChangedEvent = z.infer<typeof RoomReadyChangedEventSchema>;

export const RoomScoreUpdatedEventSchema = z.object({
  scores: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  gameNumber: z.number(),
  totalGames: z.number().optional(),
});
export type RoomScoreUpdatedEvent = z.infer<typeof RoomScoreUpdatedEventSchema>;

export const RoomDealerChangedEventSchema = z.object({
  dealer: SeatIdSchema,
  gameNumber: z.number(),
});
export type RoomDealerChangedEvent = z.infer<typeof RoomDealerChangedEventSchema>;

export const RoomSessionFinishedEventSchema = z.object({ result: SessionResultSchema });
export type RoomSessionFinishedEvent = z.infer<typeof RoomSessionFinishedEventSchema>;

export const RoomPlayerLeftEventSchema = z.object({ seat: SeatIdSchema });
export type RoomPlayerLeftEvent = z.infer<typeof RoomPlayerLeftEventSchema>;

export const RoomPlayerConnectionEventSchema = z.object({ seat: SeatIdSchema });
export type RoomPlayerConnectionEvent = z.infer<typeof RoomPlayerConnectionEventSchema>;

/** hostLeft closes a waiting room; allPlayersLeft stops a game with no human left to watch. */
export const RoomClosedEventSchema = z.object({
  reason: z.enum(["hostLeft", "allPlayersLeft"]),
});
export type RoomClosedEvent = z.infer<typeof RoomClosedEventSchema>;

/**
 * A global broadcast (every connected socket, not scoped by roomId or any
 * subscription channel — see session-mechanics.md §6 "大厅新房间推送" for
 * why) fired once when a new room enters the lobby (waiting/open, i.e.
 * lobby:list-visible). Clients filter by rulesetId (and their own local
 * search text) before inserting `room` into their list; a room leaving the
 * lobby (full, started, closed) is not pushed — still requires a fresh
 * lobby:list query.
 */
export const LobbyRoomCreatedEventSchema = z.object({
  rulesetId: z.string(),
  room: RoomSummarySchema,
});
export type LobbyRoomCreatedEvent = z.infer<typeof LobbyRoomCreatedEventSchema>;
