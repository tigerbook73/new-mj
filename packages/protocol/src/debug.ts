import { z } from "zod";

/**
 * docs/contracts/protocol-shared.md §7 — dev-only debug channel, gated
 * server-side by `ALLOW_DEBUG_OMNISCIENT`. Deliberately exposes raw TileIds
 * for concealed hands and unredacted meld tiles (anGang included, unlike the
 * normal per-viewer PlayerView); never reachable from production UI.
 * `melds[seat][meldIndex]` lines up positionally with that seat's real
 * (redacted) `melds` array from the live/replay PlayerView, so a caller only
 * needs this to fill in an anGang's otherwise-empty `tiles`.
 *
 * Live `game:snapshot`/`room:enter` debug extension. It intentionally omits
 * the wall: the Web god-mode table only needs opponents' hands and concealed
 * meld tiles, and sending less hidden state keeps this exception narrow.
 */
export const DebugOmniscientSnapshotSchema = z.object({
  hands: z.array(z.array(z.number())),
  melds: z.array(z.array(z.array(z.number()))),
});
export type DebugOmniscientSnapshot = z.infer<typeof DebugOmniscientSnapshotSchema>;

/** `DebugOmniscientSnapshotSchema` plus the undrawn wall, for `debug:omniscientView` and replay. */
export const DebugOmniscientViewSchema = DebugOmniscientSnapshotSchema.extend({
  wall: z.array(z.number()),
});
export type DebugOmniscientView = z.infer<typeof DebugOmniscientViewSchema>;

/**
 * phase 4.5 step 5 — 明牌 replay, end-of-game only, same
 * ALLOW_DEBUG_OMNISCIENT gate as the live debug:omniscientView above. No
 * roomId (unlike replay:get): scoped to whatever room this connection is
 * currently in, same "current room" convention as debug:omniscientView.
 * Response reuses DebugOmniscientViewSchema (identical shape).
 */
export const DebugReplayOmniscientViewRequestSchema = z.object({
  gameNumber: z.number(),
});
export type DebugReplayOmniscientViewRequest = z.infer<
  typeof DebugReplayOmniscientViewRequestSchema
>;
