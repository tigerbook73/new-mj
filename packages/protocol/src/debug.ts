import { z } from "zod";

/**
 * docs/contracts/protocol-shared.md §7 — dev-only debug channel, gated
 * server-side by `ALLOW_DEBUG_OMNISCIENT`. Deliberately exposes raw TileIds
 * for concealed hands and the undrawn wall; never rendered as real tile
 * faces, never reachable from production UI.
 */
export const DebugOmniscientViewSchema = z.object({
  wall: z.array(z.number()),
  hands: z.array(z.array(z.number())),
});
export type DebugOmniscientView = z.infer<typeof DebugOmniscientViewSchema>;
