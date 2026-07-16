/**
 * Compatibility barrel. Prefer importing from @new-mj/protocol, whose public
 * exports are assembled in index.ts, but keep this path stable for consumers
 * that imported the old all-in-one module directly.
 */
export * from "./common.ts";
export * from "./room-models.ts";
export * from "./room-requests.ts";
export * from "./room-events.ts";
export * from "./game.ts";
export * from "./auth.ts";
