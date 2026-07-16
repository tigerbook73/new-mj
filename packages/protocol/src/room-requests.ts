import { z } from "zod";
import { GameConfigSchema, SeatIdSchema, SessionFormatSchema } from "./common.ts";

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
  /** Omitted = first empty seat; given = that exact empty seat or SEAT_TAKEN. */
  seat: SeatIdSchema.optional(),
});
export type RoomJoinRequest = z.infer<typeof RoomJoinRequestSchema>;

export const RoomReadyRequestSchema = z.object({ ready: z.boolean() });
export type RoomReadyRequest = z.infer<typeof RoomReadyRequestSchema>;

/** Seat semantics match RoomJoinRequestSchema.seat. */
export const RoomAddBotRequestSchema = z.object({ seat: SeatIdSchema.optional() });
export type RoomAddBotRequest = z.infer<typeof RoomAddBotRequestSchema>;

export const RoomRemoveBotRequestSchema = z.object({ seat: SeatIdSchema });
export type RoomRemoveBotRequest = z.infer<typeof RoomRemoveBotRequestSchema>;

export const RoomRemovePlayerRequestSchema = z.object({ seat: SeatIdSchema });
export type RoomRemovePlayerRequest = z.infer<typeof RoomRemovePlayerRequestSchema>;

/** lobby:list — query, no side effect. */
export const LobbyListRequestSchema = z.object({
  rulesetId: z.string(),
  search: z.string().optional(),
});
export type LobbyListRequest = z.infer<typeof LobbyListRequestSchema>;

/** room:peek — query, no side effect, does not seat the caller. */
export const RoomPeekRequestSchema = z.object({ roomId: z.string() });
export type RoomPeekRequest = z.infer<typeof RoomPeekRequestSchema>;

export const RoomEnterRequestSchema = z.object({ roomId: z.string() });
export type RoomEnterRequest = z.infer<typeof RoomEnterRequestSchema>;

/** Each ruleset owns its Action union; core is the sole authority on legality. */
export const GameActionRequestSchema = z.object({ action: z.unknown() });
export type GameActionRequest = z.infer<typeof GameActionRequestSchema>;

/** docs/contracts/session-mechanics.md §6 — room:start ack is a bare receipt. */
export const RoomStartRequestSchema = z.object({});
export type RoomStartRequest = z.infer<typeof RoomStartRequestSchema>;
