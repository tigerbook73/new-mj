import { z } from "zod";

/** docs/contracts/protocol-shared.md §1 — connection-time auth payload. */
export const AuthHandshakeSchema = z.object({
  token: z.string(),
  protocolVersion: z.string(),
  takeover: z.boolean().optional(),
});
export type AuthHandshake = z.infer<typeof AuthHandshakeSchema>;
