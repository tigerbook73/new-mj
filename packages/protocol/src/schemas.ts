import { z } from "zod";

/** docs/protocol.md §4 — the full ErrCode enum; do not invent new codes outside this list. */
export const ERROR_CODES = [
  "UNAUTHORIZED",
  "VERSION_MISMATCH",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ALREADY_IN_ROOM",
  "NOT_IN_ROOM",
  "GAME_IN_PROGRESS",
  "GAME_NOT_STARTED",
  "NOT_YOUR_TURN",
  "ILLEGAL_ACTION",
  "INVALID_CONFIG",
  "INTERNAL",
] as const;
export const ErrCodeSchema = z.enum(ERROR_CODES);
export type ErrCode = z.infer<typeof ErrCodeSchema>;

/** docs/protocol.md §1 — the ack envelope every command/query response uses. */
export type Reply<T> = { ok: true; data: T } | { ok: false; code: ErrCode; message?: string };

export const SessionFormatSchema = z.enum(["4-round", "best-of-3"]);
export type SessionFormat = z.infer<typeof SessionFormatSchema>;

export const SeatIdSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const GameConfigSchema = z.object({ rulesetId: z.string() }).catchall(z.unknown());

export const PlayerSchema = z.object({
  userId: z.string(),
  seatId: SeatIdSchema,
  nickname: z.string(),
  isBot: z.boolean(),
  isReady: z.boolean(),
});
export type Player = z.infer<typeof PlayerSchema>;

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

/**
 * docs/protocol.md §2 — the RoomInfo snapshot returned by room:create/join and
 * used as the ack "进入新上下文" payload. Deliberately excludes the in-progress
 * GameState (docs/rooms.md's Room#gameState) and the server-only seed: those
 * never cross the wire, only PlayerView (via game:snapshot) does.
 */
export const RoomInfoSchema = z.object({
  id: z.string(),
  rulesetId: z.string(),
  config: GameConfigSchema,
  sessionFormat: SessionFormatSchema,
  phase: z.enum(["waiting", "in-game", "finished"]),
  status: z.enum(["open", "closed"]),
  players: nullablePlayerTupleSchema,
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

export const RoomSummarySchema = z.object({
  id: z.string(),
  rulesetId: z.string(),
  playerCount: z.number(),
  status: z.enum(["open", "closed"]),
});
export type RoomSummary = z.infer<typeof RoomSummarySchema>;

// --- ack request payloads (client -> server), docs/protocol.md §2 ---

export const RoomCreateRequestSchema = z.object({
  rulesetId: z.string(),
  config: GameConfigSchema.optional(),
  sessionFormat: SessionFormatSchema.optional(),
});
export type RoomCreateRequest = z.infer<typeof RoomCreateRequestSchema>;

export const RoomJoinRequestSchema = z.object({ roomId: z.string() });
export type RoomJoinRequest = z.infer<typeof RoomJoinRequestSchema>;

export const RoomReadyRequestSchema = z.object({ ready: z.boolean() });
export type RoomReadyRequest = z.infer<typeof RoomReadyRequestSchema>;

/**
 * action is intentionally z.unknown(): each ruleset owns its own Action union
 * (D12) and core's applyAction is the sole authority on legality — the
 * protocol layer must not re-validate action shape.
 */
export const GameActionRequestSchema = z.object({ action: z.unknown() });
export type GameActionRequest = z.infer<typeof GameActionRequestSchema>;
