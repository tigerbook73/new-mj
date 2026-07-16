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
