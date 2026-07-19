import { z } from "zod";

/** docs/contracts/protocol-shared.md §1 — connection-time auth payload. */
export const AuthHandshakeSchema = z.object({
  token: z.string(),
  protocolVersion: z.string(),
  // Tab/browser identity used by the server's session arbitration (same tab
  // vs same browser vs different browser) — see session-mechanics.md.
  tabId: z.string(),
  browserId: z.string(),
  takeover: z.boolean().optional(),
});
export type AuthHandshake = z.infer<typeof AuthHandshakeSchema>;

/**
 * session:identity query ack — docs/contracts/protocol-shared.md.
 * `activeRoom` is the server-truth restore hint (RoomService.
 * findActiveRoomForUser): the caller currently holds a seat in this room
 * (waiting, in-game, or permanently auto-piloted). Absent when unseated
 * anywhere or once the room finishes.
 */
export const SessionIdentitySchema = z.object({
  userId: z.string(),
  nickname: z.string(),
  avatar: z.string().optional(),
  activeRoom: z
    .object({ roomId: z.string(), phase: z.enum(["waiting", "in-game", "finished"]) })
    .optional(),
});
export type SessionIdentity = z.infer<typeof SessionIdentitySchema>;
