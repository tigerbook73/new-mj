export const packageName = "@new-mj/core" as const;

export * from "./types.ts";
export * from "./events.ts";
export * from "./lib/ids.ts";
export * from "./lib/seat.ts";
export * from "./lib/tiles.ts";
export * from "./lib/prng.ts";
export * from "./lib/wall.ts";
export * from "./lib/win.ts";
export * from "./lib/invariants.ts";
export * from "./rulesets/junk/index.ts";
export * from "./rulesets/bloodbattle/index.ts";
export * from "./simulate.ts";
// Explicit (not `export *`) so the engine-api's own getPlayerView wins over
// rulesets/junk's same-named export — see D12 proposal §5 commit5.
export type { RulesetModule } from "./engine.ts";
export { applyAction, createGame, getLegalActions, getPlayerView } from "./engine.ts";
