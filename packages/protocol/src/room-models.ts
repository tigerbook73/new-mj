import { z } from "zod";
import { GameConfigSchema, SeatIdSchema, SessionFormatSchema } from "./common.ts";

export const PlayerSchema = z.object({
  userId: z.string(),
  seatId: SeatIdSchema,
  nickname: z.string(),
  avatar: z.string().optional(),
  isBot: z.boolean(),
  isReady: z.boolean(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const RoomParticipantSchema = z.object({
  userId: z.string(),
  nickname: z.string(),
  avatar: z.string().optional(),
  isSeated: z.boolean(),
  isBot: z.boolean(),
});
export type RoomParticipant = z.infer<typeof RoomParticipantSchema>;

export const RankingEntrySchema = z.object({
  seatId: SeatIdSchema,
  score: z.number(),
});
export type RankingEntry = z.infer<typeof RankingEntrySchema>;

export const SessionResultSchema = z.object({
  winner: SeatIdSchema,
  ranking: z.array(RankingEntrySchema),
  format: SessionFormatSchema,
  gamesPlayed: z.number(),
});
export type SessionResult = z.infer<typeof SessionResultSchema>;

const scoreTupleSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const nullablePlayerTupleSchema = z.tuple([
  PlayerSchema.nullable(),
  PlayerSchema.nullable(),
  PlayerSchema.nullable(),
  PlayerSchema.nullable(),
]);

/** docs/contracts/session-mechanics.md §2 — the room snapshot returned when entering a room. */
export const RoomInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerUserId: z.string(),
  owner: z.string(),
  rulesetId: z.string(),
  config: GameConfigSchema,
  sessionFormat: SessionFormatSchema,
  phase: z.enum(["waiting", "in-game", "finished"]),
  status: z.enum(["open", "closed"]),
  players: nullablePlayerTupleSchema,
  participants: z.array(RoomParticipantSchema).optional(),
  scores: scoreTupleSchema,
  gameNumber: z.number(),
  totalGames: z.number().optional(),
  wins: scoreTupleSchema.optional(),
  dealer: SeatIdSchema,
  createdAt: z.number(),
  finishedAt: z.number().optional(),
  result: SessionResultSchema.optional(),
});
export type RoomInfo = z.infer<typeof RoomInfoSchema>;

/** lobby:list's response shape — a lighter-weight projection than RoomInfo. */
export const RoomSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  rulesetId: z.string(),
  creator: z.string(),
  createdAt: z.number(),
  playerCount: z.number(),
  status: z.enum(["open", "closed"]),
});
export type RoomSummary = z.infer<typeof RoomSummarySchema>;
