import { z } from "zod";

/**
 * docs/contracts/protocol-shared.md §1 / decisions.md D7 — protocol has no
 * version negotiation, only this constant to tell a drifted client to
 * refresh. Single source of truth: apps/server's ConfigService and
 * apps/web's handshake both import this instead of hardcoding "1.0".
 */
export const PROTOCOL_VERSION = "1.0";

/** docs/contracts/protocol-shared.md §5 — the full ErrCode enum; do not invent new codes outside this list. */
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
  "SEAT_TAKEN",
] as const;
export const ErrCodeSchema = z.enum(ERROR_CODES);
export type ErrCode = z.infer<typeof ErrCodeSchema>;

/** docs/contracts/protocol-shared.md §2 — the ack envelope every command/query response uses. */
export type Reply<T> = { ok: true; data: T } | { ok: false; code: ErrCode; message?: string };

export const SessionFormatSchema = z.enum(["4-round", "best-of-3"]);
export type SessionFormat = z.infer<typeof SessionFormatSchema>;

export const SeatIdSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type SeatId = z.infer<typeof SeatIdSchema>;

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
 * docs/contracts/session-mechanics.md §2 — the RoomInfo snapshot returned by
 * room:create/join and used as the ack "进入新上下文" payload. Deliberately
 * excludes the in-progress GameState (Room#gameState) and the server-only seed: those
 * never cross the wire, only PlayerView (via game:snapshot) does.
 */
export const RoomInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
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

/** lobby:list's response shape — a lighter-weight projection than RoomInfo, one entry per open+waiting room. */
export const RoomSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  rulesetId: z.string(),
  playerCount: z.number(),
  status: z.enum(["open", "closed"]),
});
export type RoomSummary = z.infer<typeof RoomSummarySchema>;

// --- ack request payloads (client -> server), docs/contracts/protocol-shared.md §3 / session-mechanics.md §6 ---

export const RoomCreateRequestSchema = z.object({
  rulesetId: z.string(),
  config: GameConfigSchema.optional(),
  sessionFormat: SessionFormatSchema.optional(),
  /** Defaults server-side to `${hostNickname}'s room` when omitted. */
  name: z.string().optional(),
});
export type RoomCreateRequest = z.infer<typeof RoomCreateRequestSchema>;

export const RoomJoinRequestSchema = z.object({
  roomId: z.string(),
  /** Omitted = fall back to "first empty seat" (existing behavior); given = must be that exact empty seat or SEAT_TAKEN. */
  seat: SeatIdSchema.optional(),
});
export type RoomJoinRequest = z.infer<typeof RoomJoinRequestSchema>;

export const RoomReadyRequestSchema = z.object({ ready: z.boolean() });
export type RoomReadyRequest = z.infer<typeof RoomReadyRequestSchema>;

/** seat semantics match RoomJoinRequestSchema.seat. */
export const RoomAddBotRequestSchema = z.object({ seat: SeatIdSchema.optional() });
export type RoomAddBotRequest = z.infer<typeof RoomAddBotRequestSchema>;

/** lobby:list — query, no side effect. Only returns rooms that are actually joinable (phase "waiting", status "open"); MVP has no spectating. */
export const LobbyListRequestSchema = z.object({
  rulesetId: z.string(),
  search: z.string().optional(),
});
export type LobbyListRequest = z.infer<typeof LobbyListRequestSchema>;

/** room:peek — query, no side effect, does not seat the caller. One-time snapshot for the pre-join room page's seat layout. */
export const RoomPeekRequestSchema = z.object({ roomId: z.string() });
export type RoomPeekRequest = z.infer<typeof RoomPeekRequestSchema>;

/**
 * action is intentionally z.unknown(): each ruleset owns its own Action union
 * (D12) and core's applyAction is the sole authority on legality — the
 * protocol layer must not re-validate action shape.
 */
export const GameActionRequestSchema = z.object({ action: z.unknown() });
export type GameActionRequest = z.infer<typeof GameActionRequestSchema>;

/** docs/contracts/session-mechanics.md §6 — room:start ack is a bare receipt, no data. */
export const RoomStartRequestSchema = z.object({});
export type RoomStartRequest = z.infer<typeof RoomStartRequestSchema>;

// --- handshake (connection-time auth payload), docs/contracts/protocol-shared.md §1 ---

export const AuthHandshakeSchema = z.object({
  token: z.string(),
  protocolVersion: z.string(),
  resume: z.object({ roomId: z.string() }).optional(),
});
export type AuthHandshake = z.infer<typeof AuthHandshakeSchema>;

// --- room:* event pushes (server -> client), docs/contracts/session-mechanics.md §6 ---

export const RoomPlayerJoinedEventSchema = z.object({
  seat: SeatIdSchema,
  nickname: z.string(),
  isBot: z.boolean(),
});
export type RoomPlayerJoinedEvent = z.infer<typeof RoomPlayerJoinedEventSchema>;

export const RoomReadyChangedEventSchema = z.object({
  seat: SeatIdSchema,
  ready: z.boolean(),
});
export type RoomReadyChangedEvent = z.infer<typeof RoomReadyChangedEventSchema>;

export const RoomScoreUpdatedEventSchema = z.object({
  scores: scoreTupleSchema,
  gameNumber: z.number(),
  totalGames: z.number().optional(),
});
export type RoomScoreUpdatedEvent = z.infer<typeof RoomScoreUpdatedEventSchema>;

export const RoomDealerChangedEventSchema = z.object({
  dealer: SeatIdSchema,
  gameNumber: z.number(),
});
export type RoomDealerChangedEvent = z.infer<typeof RoomDealerChangedEventSchema>;

export const RoomSessionFinishedEventSchema = z.object({
  result: SessionResultSchema,
});
export type RoomSessionFinishedEvent = z.infer<typeof RoomSessionFinishedEventSchema>;

export const RoomPlayerLeftEventSchema = z.object({ seat: SeatIdSchema });
export type RoomPlayerLeftEvent = z.infer<typeof RoomPlayerLeftEventSchema>;

/** hostLeft: host left the waiting room, so it's gone. allPlayersLeft: every seat is now bot/auto-piloted, nobody left to watch, so the game was stopped. */
export const RoomClosedEventSchema = z.object({
  reason: z.enum(["hostLeft", "allPlayersLeft"]),
});
export type RoomClosedEvent = z.infer<typeof RoomClosedEventSchema>;

// --- in-game envelope (server -> client), docs/contracts/engine-contract.md §6-7 ---

/**
 * Mirrors core's EventVisibility (packages/core/src/events.ts). Protocol
 * cannot import from core (D12 keeps engine-api independent of transport),
 * so the shape is redeclared here rather than shared.
 */
export const EventVisibilitySchema = z.union([
  z.object({ type: z.literal("public") }),
  z.object({ type: z.literal("seat"), seats: z.array(SeatIdSchema) }),
]);
export type EventVisibility = z.infer<typeof EventVisibilitySchema>;

/**
 * payload is intentionally z.unknown(): event payloads are ruleset-private
 * (docs/doc-map.md §4's D12 exception — no centralized type to point to),
 * only the envelope (seq/visibility) is a public cross-ruleset contract.
 */
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

/**
 * Mirrors core's PlayerViewBase (packages/core/src/types.ts) — only the
 * cross-ruleset common skeleton; ruleset-specific fields (phase,
 * myClaimOptions, ...) are left as unknown extra keys via .catchall().
 */
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
