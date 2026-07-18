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
